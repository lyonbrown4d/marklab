use super::*;

impl AssetService {
  pub fn serve(
    &self,
    owner: &str,
    token: &str,
    range: Option<&str>,
    head: bool,
  ) -> BackendResult<(Vec<u8>, String, Option<String>, u64)> {
    use std::io::{Read, Seek};
    let grant = self
      .grants
      .lock()
      .map_err(|_| BackendError::new("STATE_ERROR", "Asset registry is unavailable"))?
      .get(token)
      .filter(|g| g.owner == owner && g.expires > now_ms())
      .cloned()
      .ok_or_else(|| BackendError::new("ASSET_EXPIRED", "Preview permission expired"))?;
    let mut file = std::fs::File::open(&grant.path)?;
    if same_file::Handle::from_file(file.try_clone()?)? != *grant.identity {
      return Err(BackendError::new(
        "ASSET_CHANGED",
        "Preview file changed; request a new preview",
      ));
    }
    let metadata = file.metadata()?;
    let length = metadata.len();
    if length != grant.length || metadata.modified()? != grant.modified {
      return Err(BackendError::new(
        "ASSET_CHANGED",
        "Preview file changed; request a new preview",
      ));
    }
    let selected = ranges::select(range, length)?;
    let (start, count) = selected.map(|(s, e)| (s, e - s + 1)).unwrap_or((0, length));
    if !head && count > 128 * 1024 * 1024 {
      return Err(BackendError::new(
        "ASSET_TOO_LARGE",
        "Use a range request for large preview assets",
      ));
    }
    let mut data = Vec::new();
    if !head {
      file.seek(std::io::SeekFrom::Start(start))?;
      data.reserve(count as usize);
      (&mut file).take(count).read_to_end(&mut data)?;
      if data.len() as u64 != count {
        return Err(BackendError::new(
          "ASSET_CHANGED",
          "Preview file changed during reading",
        ));
      }
      let after = file.metadata()?;
      if after.len() != grant.length || after.modified()? != grant.modified {
        return Err(BackendError::new(
          "ASSET_CHANGED",
          "Preview file changed during reading",
        ));
      }
    }
    let content_range = selected.map(|(s, e)| format!("bytes {s}-{e}/{length}"));
    Ok((data, grant.mime, content_range, count))
  }
}
