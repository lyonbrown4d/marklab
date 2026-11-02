use super::lfs_endpoint::{client, download_remote, error};
use crate::error::BackendResult;
use git_lfs_api::{Operation, Ref};
use git_lfs_pointer::{Oid, Pointer};
use std::{
  path::Path,
  sync::{OnceLock, atomic::Ordering},
  time::{Duration, Instant},
};

fn runtime() -> BackendResult<&'static tokio::runtime::Runtime> {
  static RUNTIME: OnceLock<BackendResult<tokio::runtime::Runtime>> = OnceLock::new();
  RUNTIME
    .get_or_init(|| {
      tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .max_blocking_threads(2)
        .thread_name("marklab-lfs")
        .enable_all()
        .build()
        .map_err(|_| error("The Git LFS transfer worker could not be initialized"))
    })
    .as_ref()
    .map_err(Clone::clone)
}

fn wait<F>(deadline: Instant, future: F) -> BackendResult<()>
where
  F: std::future::Future<Output = BackendResult<()>>,
{
  super::lfs_cancel::check()?;
  let cancel = super::lfs_cancel::token();
  runtime()?.block_on(async {
    let cancelled = async {
      loop {
        if cancel.as_ref().is_some_and(|value| value.load(Ordering::Acquire)) { break; }
        tokio::time::sleep(Duration::from_millis(100)).await;
      }
    };
    tokio::select! {
      _ = cancelled => Err(super::process::error("git_operation_cancelled", "Git LFS operation was cancelled")),
      result = tokio::time::timeout(deadline.saturating_duration_since(Instant::now()), future) => {
        result.map_err(|_| error("Git LFS transfer timed out; retry when the endpoint is available"))?
      }
    }
  })
}

/// Called from libgit2's blocking filter callback, never from an async task.
pub fn fetch_missing(root: &Path, pointer: &Pointer) -> BackendResult<()> {
  let store = super::lfs::store(root)?;
  if super::lfs::object_path(&store, pointer.oid)?.is_file() {
    super::lfs::open_object(&store, pointer)?;
    return Ok(());
  }
  if !pointer.extensions.is_empty() {
    return Err(error(
      "Git LFS pointer extensions are unsupported; use standard HTTPS basic objects",
    ));
  }
  if pointer.oid == Oid::EMPTY && pointer.size == 0 {
    return Ok(());
  }
  // Do not call process::open: filter registration may still be initializing.
  let repo = git2::Repository::open(root)?;
  let context = client(&repo, &download_remote(&repo)?, false)?;
  let reference = repo
    .head()
    .ok()
    .and_then(|head| head.name().ok().map(Ref::new));
  wait(
    Instant::now() + Duration::from_secs(180),
    super::lfs_transfer::run(
      &context,
      &store,
      std::slice::from_ref(pointer),
      Operation::Download,
      reference,
    ),
  )?;
  super::lfs_cancel::check()?;
  super::lfs::open_object(&store, pointer)?;
  Ok(())
}

/// Default ref scope for callers that push the current local branch.
#[cfg(test)]
pub fn upload(repo: &git2::Repository, remote: &str, head: git2::Oid) -> BackendResult<()> {
  let reference = repo
    .head()
    .ok()
    .and_then(|head| head.name().ok().map(str::to_owned));
  upload_inner(repo, remote, head, reference.as_deref())
}

pub fn upload_to(
  repo: &git2::Repository,
  remote: &str,
  head: git2::Oid,
  destination: &str,
) -> BackendResult<()> {
  if !destination.starts_with("refs/heads/") || !git2::Reference::is_valid_name(destination) {
    return Err(error(
      "Git LFS upload requires a valid destination branch reference",
    ));
  }
  upload_inner(repo, remote, head, Some(destination))
}

fn upload_inner(
  repo: &git2::Repository,
  remote: &str,
  head: git2::Oid,
  reference: Option<&str>,
) -> BackendResult<()> {
  let pointers = super::lfs_history::pointers(repo, remote, head)?;
  if pointers.is_empty() {
    return Ok(());
  }
  let root = repo
    .workdir()
    .ok_or_else(|| error("Git LFS upload requires a working tree"))?;
  let store = super::lfs::store(root)?;
  let context = client(repo, remote, true)?;
  wait(
    Instant::now() + Duration::from_secs(180),
    super::lfs_transfer::run(
      &context,
      &store,
      &pointers,
      Operation::Upload,
      reference.map(Ref::new),
    ),
  )
}
