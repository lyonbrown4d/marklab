mod blocking;
mod cache;
mod clone;
mod clone_destination;
pub use clone::clone_repository;
mod commands0;
mod commands1;
mod commands2;
mod commands3;
mod commands4;
mod commands5;
mod conflict;
mod conflict_index;
mod conflict_write;
mod history;
mod lfs;
mod lfs_cancel;
mod lfs_checkout;
mod lfs_endpoint;
mod lfs_filter;
mod lfs_filter_ffi;
mod lfs_history;
mod lfs_network;
mod lfs_transfer;
mod lfs_transfer_io;
mod local;
mod local_revisions;
mod open_file;
mod preview;
mod sequence;
mod sequencer;
mod stash;
pub use open_file::*;
mod preview_file;
mod process;
mod remote;
mod safety;
mod status;
mod transport;
pub mod types;
pub use commands0::*;
pub use commands1::*;
pub use commands2::*;
pub use commands3::*;
pub use commands4::*;
pub use commands5::*;
use std::{
  collections::HashMap,
  path::{Path, PathBuf},
  sync::{Arc, Weak},
};
use tokio::sync::Mutex;
#[derive(Default)]
pub struct GitState {
  locks: Mutex<HashMap<PathBuf, Weak<RepositoryGate>>>,
  queries: cache::Queries,
}
impl GitState {
  pub async fn lock(&self, root: &Path) -> Arc<RepositoryGate> {
    let root = cache::root_key(root);
    let mut locks = self.locks.lock().await;
    locks.retain(|_, value| value.strong_count() > 0);
    if let Some(lock) = locks.get(&root).and_then(Weak::upgrade) {
      return lock;
    }
    let lock = Arc::new(RepositoryGate::default());
    locks.insert(root, Arc::downgrade(&lock));
    lock
  }
}
#[cfg(test)]
mod tests;

#[cfg(test)]
mod test_lfs;
#[cfg(test)]
mod test_lfs_network;
#[cfg(test)]
mod test_lfs_operations;
#[cfg(test)]
mod test_lifecycle;
#[cfg(test)]
mod test_remote;
#[cfg(test)]
mod test_support;

pub async fn initialize() -> crate::error::BackendResult<()> {
  crate::blocking::run(process::initialize).await
}

#[cfg(test)]
mod test_sequences;

#[derive(Default)]
pub struct RepositoryGate(tokio::sync::RwLock<()>);
impl RepositoryGate {
  pub async fn lock(&self) -> tokio::sync::RwLockWriteGuard<'_, ()> {
    self.0.write().await
  }
  async fn read(&self) -> tokio::sync::RwLockReadGuard<'_, ()> {
    self.0.read().await
  }
}
