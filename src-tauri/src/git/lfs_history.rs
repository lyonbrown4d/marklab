use super::lfs_endpoint::error;
use crate::error::BackendResult;
use git_lfs_pointer::{Oid, Pointer};
use std::collections::{BTreeMap, HashSet};

fn regular(mode: git2::FileMode) -> bool {
  matches!(
    mode,
    git2::FileMode::Blob | git2::FileMode::BlobExecutable | git2::FileMode::BlobGroupWritable
  )
}

/// Collect pointer changes across every outgoing commit, including ancestors
/// whose files were removed later. Retained remote files need no local object.
pub(super) fn pointers(
  repo: &git2::Repository,
  remote: &str,
  head: git2::Oid,
) -> BackendResult<Vec<Pointer>> {
  let mut commits = repo.revwalk()?;
  commits.push(head)?;
  let prefix = format!("refs/remotes/{remote}/");
  for reference in repo.references()? {
    let reference = reference?;
    if reference.name().is_ok_and(|name| name.starts_with(&prefix))
      && let Ok(commit) = reference.peel_to_commit()
    {
      commits.hide(commit.id())?;
    }
  }
  let mut blobs = HashSet::new();
  let mut pointers = BTreeMap::<Oid, Pointer>::new();
  let odb = repo.odb()?;
  for id in commits {
    super::lfs_cancel::check()?;
    let commit = repo.find_commit(id?)?;
    let tree = commit.tree()?;
    let parent = if commit.parent_count() == 0 {
      None
    } else {
      Some(commit.parent(0)?.tree()?)
    };
    let mut options = git2::DiffOptions::new();
    options.include_typechange(true);
    let diff = repo.diff_tree_to_tree(parent.as_ref(), Some(&tree), Some(&mut options))?;
    for delta in diff.deltas() {
      super::lfs_cancel::check()?;
      if !matches!(
        delta.status(),
        git2::Delta::Added | git2::Delta::Modified | git2::Delta::Typechange
      ) {
        continue;
      }
      let file = delta.new_file();
      if !regular(file.mode()) || file.id().is_zero() {
        continue;
      }
      // A permission-only change does not introduce an object absent remotely.
      if regular(delta.old_file().mode()) && delta.old_file().id() == file.id() {
        continue;
      }
      if !blobs.insert(file.id()) {
        continue;
      }
      // Object headers avoid loading full binary blobs just to detect pointers.
      let (size, kind) = odb.read_header(file.id())?;
      if kind != git2::ObjectType::Blob || size == 0 || size >= git_lfs_pointer::MAX_POINTER_SIZE {
        continue;
      }
      let blob = repo.find_blob(file.id())?;
      match Pointer::parse(blob.content()) {
        Ok(pointer) => {
          if !pointer.extensions.is_empty() {
            return Err(error(
              "Git LFS pointer extensions in pushed history are unsupported",
            ));
          }
          if pointers
            .get(&pointer.oid)
            .is_some_and(|previous| previous.size != pointer.size)
          {
            return Err(error(
              "Git history contains inconsistent sizes for the same Git LFS object",
            ));
          }
          pointers.insert(pointer.oid, pointer);
        }
        Err(value) if value.is_not_a_pointer() => {}
        Err(_) => {
          return Err(error(
            "Git history contains a malformed Git LFS pointer; repair it before pushing",
          ));
        }
      }
    }
  }
  Ok(
    pointers
      .into_values()
      .filter(|pointer| pointer.size != 0)
      .collect(),
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  fn commit(repo: &git2::Repository, parents: &[git2::Oid], files: &[(&str, &[u8])]) -> git2::Oid {
    let mut builder = repo.treebuilder(None).unwrap();
    for (name, content) in files {
      builder
        .insert(name, repo.blob(content).unwrap(), 0o100644)
        .unwrap();
    }
    let tree = repo.find_tree(builder.write().unwrap()).unwrap();
    let parents: Vec<_> = parents
      .iter()
      .map(|id| repo.find_commit(*id).unwrap())
      .collect();
    let parents: Vec<_> = parents.iter().collect();
    let signature = git2::Signature::now("Fixture", "fixture@example.invalid").unwrap();
    repo
      .commit(
        Some("HEAD"),
        &signature,
        &signature,
        "fixture",
        &tree,
        &parents,
      )
      .unwrap()
  }

  #[test]
  fn unchanged_remote_pointer_does_not_require_pruned_content() {
    let directory = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(directory.path()).unwrap();
    let store = git_lfs_store::Store::new(repo.path().join("lfs"));
    let (oid, size) = store.insert(&mut &b"old remote content"[..]).unwrap();
    let pointer = Pointer::new(oid, size).encode();
    let files = [
      ("old.bin", pointer.as_bytes()),
      ("notes.txt", &b"before"[..]),
    ];
    let baseline = commit(&repo, &[], &files);
    repo
      .reference("refs/remotes/origin/main", baseline, true, "fixture")
      .unwrap();
    std::fs::remove_file(store.object_path(oid)).unwrap();
    let files = [
      ("old.bin", pointer.as_bytes()),
      ("notes.txt", &b"after"[..]),
    ];
    let head = commit(&repo, &[baseline], &files);
    assert!(pointers(&repo, "origin", head).unwrap().is_empty());
    // Empty pointer changes avoid endpoint and credential lookup entirely.
    super::super::lfs_network::upload(&repo, "origin", head).unwrap();
  }

  #[test]
  fn outgoing_pointer_removed_at_head_is_still_collected() {
    let directory = tempfile::tempdir().unwrap();
    let repo = git2::Repository::init(directory.path()).unwrap();
    let baseline = commit(&repo, &[], &[("notes.txt", b"base")]);
    repo
      .reference("refs/remotes/origin/main", baseline, true, "fixture")
      .unwrap();
    let pointer = Pointer::new(Oid::from_bytes([9; 32]), 42);
    let encoded = pointer.encode();
    let introduced = commit(&repo, &[baseline], &[("new.bin", encoded.as_bytes())]);
    let head = commit(&repo, &[introduced], &[("notes.txt", b"after")]);
    assert_eq!(pointers(&repo, "origin", head).unwrap(), vec![pointer]);
  }
}
