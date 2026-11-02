//! Narrow bindings for libgit2 1.9's public `git2/sys/filter.h` ABI.
//! `libgit2-sys` supplies the write-stream and repository bindings, but not filters.
use std::{
  ffi::{CStr, CString, c_char, c_int, c_uint, c_void},
  panic::{AssertUnwindSafe, catch_unwind},
};

pub(super) use libgit2_sys::git_writestream as WriteStream;

#[repr(C)]
pub(super) struct Source {
  _private: [u8; 0],
}

type Init = extern "C" fn(*mut Filter) -> c_int;
type Shutdown = extern "C" fn(*mut Filter);
type Check =
  extern "C" fn(*mut Filter, *mut *mut c_void, *const Source, *const *const c_char) -> c_int;
type Stream = extern "C" fn(
  *mut *mut WriteStream,
  *mut Filter,
  *mut *mut c_void,
  *const Source,
  *mut WriteStream,
) -> c_int;
type Cleanup = extern "C" fn(*mut Filter, *mut c_void);

// Field order follows GIT_FILTER_VERSION 1. The deprecated `apply` slot is
// pointer-sized even when libgit2 is built with GIT_DEPRECATE_HARD.
#[repr(C)]
pub(super) struct Filter {
  pub version: c_uint,
  pub attributes: *const c_char,
  pub initialize: Option<Init>,
  pub shutdown: Option<Shutdown>,
  pub check: Option<Check>,
  pub apply: *mut c_void,
  pub stream: Option<Stream>,
  pub cleanup: Option<Cleanup>,
}

unsafe extern "C" {
  pub(super) fn git_filter_register(
    name: *const c_char,
    filter: *mut Filter,
    priority: c_int,
  ) -> c_int;
  pub(super) fn git_filter_source_repo(source: *const Source) -> *mut libgit2_sys::git_repository;
  pub(super) fn git_filter_source_mode(source: *const Source) -> c_int;
}

/// No Rust unwind may escape a native callback. Error text is copied by libgit2.
pub(super) fn boundary(action: impl FnOnce() -> Result<(), String>) -> c_int {
  match catch_unwind(AssertUnwindSafe(action)) {
    Ok(Ok(())) => 0,
    Ok(Err(message)) => fail(&message),
    Err(_) => fail("Git LFS filter failed unexpectedly"),
  }
}

pub(super) fn fail(message: &str) -> c_int {
  let message = super::process::redact(message).replace('\0', " ");
  if let Ok(message) = CString::new(message) {
    // SAFETY: CString lives through the call; libgit2 copies the message.
    unsafe {
      libgit2_sys::git_error_set_str(libgit2_sys::GIT_ERROR_FILTER as c_int, message.as_ptr())
    };
  }
  -1
}

pub(super) fn last_error(fallback: &str) -> String {
  // SAFETY: libgit2 keeps the thread-local error alive until the next error call.
  unsafe {
    let error = libgit2_sys::git_error_last();
    if error.is_null() || (*error).message.is_null() {
      fallback.to_owned()
    } else {
      super::process::redact(&CStr::from_ptr((*error).message).to_string_lossy())
    }
  }
}

/// The caller owns `target` and frees each stream separately after closing.
pub(super) struct Target(pub *mut WriteStream);

impl std::io::Write for Target {
  fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
    super::lfs_cancel::check().map_err(|error| std::io::Error::other(error.message))?;
    // SAFETY: target is the live downstream stream supplied by libgit2. A native
    // write consumes the full buffer on success; it does not return a byte count.
    let write = unsafe { (*self.0).write }
      .ok_or_else(|| std::io::Error::other("Git LFS output stream has no writer"))?;
    if write(self.0, bytes.as_ptr().cast(), bytes.len()) < 0 {
      return Err(std::io::Error::other(last_error(
        "Git LFS output write failed",
      )));
    }
    Ok(bytes.len())
  }

  fn flush(&mut self) -> std::io::Result<()> {
    Ok(())
  }
}

pub(super) fn close_target(target: *mut WriteStream) -> Result<(), String> {
  // SAFETY: the adapter receives a valid target for the lifetime of its stream.
  let close = unsafe { (*target).close }.ok_or("Git LFS output stream has no close callback")?;
  if close(target) < 0 {
    return Err(last_error("Git LFS output close failed"));
  }
  Ok(())
}
