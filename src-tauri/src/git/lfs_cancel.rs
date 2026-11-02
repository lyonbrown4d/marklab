//! Clone checkout filters run on the same blocking worker as the clone itself.
use std::{
  cell::RefCell,
  sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
  },
};

thread_local! {
  static CANCEL: RefCell<Option<Arc<AtomicBool>>> = const { RefCell::new(None) };
}

pub(super) struct Guard(Option<Arc<AtomicBool>>);
impl Guard {
  pub(super) fn new(cancel: Arc<AtomicBool>) -> Self {
    Self(CANCEL.with(|current| current.replace(Some(cancel))))
  }
}
impl Drop for Guard {
  fn drop(&mut self) {
    CANCEL.with(|current| {
      let _ = current.replace(self.0.take());
    });
  }
}
pub(super) fn token() -> Option<Arc<AtomicBool>> {
  CANCEL.with(|current| current.borrow().clone())
}
pub(super) fn check() -> crate::error::BackendResult<()> {
  if token().is_some_and(|cancel| cancel.load(Ordering::Acquire)) {
    return Err(super::process::error(
      "git_operation_cancelled",
      "Git LFS operation was cancelled",
    ));
  }
  Ok(())
}
