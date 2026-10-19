use super::super::{Manifest, ManifestEntry, paths};
use crate::error::{BackendError, BackendResult};
use std::collections::{BTreeMap, BTreeSet};
use unicode_normalization::UnicodeNormalization;
pub const MANIFEST_PATH: &str = ".marklab-sync/manifest.json";
pub const MAX_MANIFEST: u64 = 4 * 1024 * 1024;
pub const MAX_FILE: u64 = 128 * 1024 * 1024;
pub fn failure(message: &str) -> BackendError {
  BackendError::new("SYNC_VALIDATION", message)
}
pub fn portable(path: &str) -> String {
  path.nfc().collect::<String>().to_lowercase()
}
pub fn validate(manifest: &Manifest) -> BackendResult<()> {
  if manifest.version != 1
    || manifest.device_id.is_empty()
    || manifest.device_id.len() > 128
    || manifest.entries.len() > 1_000_000
    || chrono::DateTime::parse_from_rfc3339(&manifest.updated_at).is_err()
  {
    return Err(failure("Invalid sync manifest"));
  }
  let mut seen = BTreeSet::new();
  for entry in &manifest.entries {
    let path = paths::sync_path(&entry.path)?;
    if path != entry.path
      || !seen.insert(portable(&path))
      || entry.hash.len() != 64
      || !entry
        .hash
        .bytes()
        .all(|v| v.is_ascii_digit() || matches!(v, b'a'..=b'f'))
      || entry.size > 9_007_199_254_740_991
      || entry.device_id.is_empty()
      || entry.device_id.len() > 128
      || entry.storage.as_deref().is_some_and(|v| v != "object")
      || chrono::DateTime::parse_from_rfc3339(&entry.modified_at).is_err()
      || entry
        .deleted_at
        .as_ref()
        .is_some_and(|v| chrono::DateTime::parse_from_rfc3339(v).is_err())
      || entry
        .etag
        .as_ref()
        .is_some_and(|v| v.is_empty() || v.len() > 2048 || v.chars().any(char::is_control))
    {
      return Err(failure("Invalid or conflicting sync manifest entry"));
    }
  }
  Ok(())
}
pub fn compatible<'a>(paths: impl Iterator<Item = &'a str>) -> BackendResult<()> {
  let mut seen = BTreeMap::new();
  for path in paths {
    let key = portable(path);
    if seen
      .insert(key, path)
      .is_some_and(|previous| previous != path)
    {
      return Err(failure("Conflicting portable sync paths"));
    }
  }
  Ok(())
}
pub fn parse(bytes: &[u8]) -> BackendResult<Manifest> {
  if bytes.len() as u64 > MAX_MANIFEST {
    return Err(failure("Sync manifest exceeds the supported size"));
  }
  let manifest: Manifest = serde_json::from_slice(bytes)?;
  validate(&manifest)?;
  Ok(manifest)
}
pub fn serialize(manifest: &Manifest) -> BackendResult<Vec<u8>> {
  validate(manifest)?;
  let bytes = serde_json::to_vec(manifest)?;
  if bytes.len() as u64 > MAX_MANIFEST {
    return Err(failure("Sync manifest exceeds the supported size"));
  }
  Ok(bytes)
}
pub fn strong(etag: Option<&str>) -> BackendResult<&str> {
  etag
    .filter(|v| !v.trim().is_empty() && !v.trim().to_ascii_lowercase().starts_with("w/"))
    .ok_or_else(|| failure("Remote sync manifest requires a strong ETag"))
}
pub fn content_path(entry: &ManifestEntry) -> String {
  if entry.storage.as_deref() == Some("object") {
    format!(".marklab-sync/objects/{}", entry.hash)
  } else {
    entry.path.clone()
  }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
  Upload,
  Download,
  DeleteRemote,
  DeleteLocal,
  Conflict,
  Noop,
  Skip,
}
#[derive(Clone)]
pub struct Operation {
  pub kind: Kind,
  pub path: String,
  pub local: Option<ManifestEntry>,
  pub baseline: Option<ManifestEntry>,
  pub remote: Option<ManifestEntry>,
}
fn state(entry: Option<&ManifestEntry>) -> u8 {
  match entry {
    None => 0,
    Some(value) if value.deleted_at.is_some() => 1,
    Some(_) => 2,
  }
}
fn same(left: Option<&ManifestEntry>, right: Option<&ManifestEntry>) -> bool {
  let l = state(left);
  let r = state(right);
  l == r && (l != 2 || left.zip(right).is_some_and(|(a, b)| a.hash == b.hash))
}
fn changed(current: Option<&ManifestEntry>, baseline: Option<&ManifestEntry>) -> bool {
  if state(baseline) == 1 && state(current) != 2 {
    false
  } else {
    !same(current, baseline)
  }
}
pub fn plan(
  local: &[ManifestEntry],
  baseline: &[ManifestEntry],
  remote: &[ManifestEntry],
  protected: &BTreeSet<String>,
) -> Vec<Operation> {
  let map = |entries: &[ManifestEntry]| {
    entries
      .iter()
      .map(|v| (v.path.clone(), v.clone()))
      .collect::<BTreeMap<_, _>>()
  };
  let local = map(local);
  let baseline = map(baseline);
  let remote = map(remote);
  let paths: BTreeSet<_> = local
    .keys()
    .chain(baseline.keys())
    .chain(remote.keys())
    .cloned()
    .collect();
  paths
    .into_iter()
    .map(|path| {
      let l = local.get(&path);
      let b = baseline.get(&path);
      let r = remote.get(&path);
      let kind = if protected.contains(&path) {
        Kind::Skip
      } else {
        match (changed(l, b), changed(r, b)) {
          (false, false) => Kind::Noop,
          (true, false) => {
            if l.is_some() {
              Kind::Upload
            } else {
              Kind::DeleteRemote
            }
          }
          (false, true) => {
            if state(r) != 2 {
              Kind::DeleteLocal
            } else {
              Kind::Download
            }
          }
          (true, true) => {
            if same(l, r) || state(l) != 2 && state(r) != 2 {
              Kind::Noop
            } else {
              Kind::Conflict
            }
          }
        }
      };
      Operation {
        kind,
        path,
        local: l.cloned(),
        baseline: b.cloned(),
        remote: r.cloned(),
      }
    })
    .collect()
}
