//! Native LFS filter driver. Repository command strings are never executed.
use super::lfs_filter_ffi::{self as ffi, Filter, Source, WriteStream};
use std::{
  ffi::{CStr, c_char, c_int, c_void},
  fs::File,
  io::{Seek, Write},
  panic::{AssertUnwindSafe, catch_unwind},
  path::PathBuf,
  sync::OnceLock,
};

/// Must run during serialized application setup, before any repository workers.
pub(super) fn register() -> Result<(), String> {
  static REGISTERED: OnceLock<Result<(), String>> = OnceLock::new();
  REGISTERED
    .get_or_init(|| {
      let mut filter = Box::new(Filter {
        version: 1,
        attributes: c"filter=lfs".as_ptr(),
        initialize: None,
        shutdown: None,
        check: None,
        apply: std::ptr::null_mut(),
        stream: Some(stream),
        cleanup: None,
      });
      // SAFETY: this is the exact version-1 public filter layout. Registration is
      // serialized by OnceLock, before use, as required by the native registry.
      let result = unsafe { ffi::git_filter_register(c"lfs".as_ptr(), &mut *filter, 200) };
      if result < 0 {
        return Err(ffi::last_error("Unable to register the Git LFS filter"));
      }
      // libgit2 retains this address. Like libgit2-sys's own initialization, the
      // registration lives for the process; no shutdown callback can free it.
      let _ = Box::leak(filter);
      Ok(())
    })
    .clone()
}

#[repr(C)]
struct Stream {
  native: WriteStream,
  target: *mut WriteStream,
  input: File,
  root: PathBuf,
  clean: bool,
  failed: bool,
  closed: Option<c_int>,
}

extern "C" fn stream(
  out: *mut *mut WriteStream,
  _filter: *mut Filter,
  _payload: *mut *mut c_void,
  source: *const Source,
  target: *mut WriteStream,
) -> c_int {
  ffi::boundary(|| {
    if out.is_null() || source.is_null() || target.is_null() {
      return Err("Git LFS received an invalid filter stream".into());
    }
    // SAFETY: libgit2 owns the source/repository until this callback returns.
    // Copy the workdir now so no source pointer is retained by the stream.
    let (root, mode) = unsafe {
      *out = std::ptr::null_mut();
      let repo = ffi::git_filter_source_repo(source);
      if repo.is_null() {
        return Err("Git LFS filtering requires a repository".into());
      }
      let workdir = libgit2_sys::git_repository_workdir(repo);
      if workdir.is_null() {
        return Err("Git LFS filtering requires a working directory".into());
      }
      (
        path(CStr::from_ptr(workdir))?,
        ffi::git_filter_source_mode(source),
      )
    };
    if mode != 0 && mode != 1 {
      return Err("Git LFS received an unsupported filter direction".into());
    }
    let input = tempfile::tempfile().map_err(|error| format!("Git LFS temporary file: {error}"))?;
    let state = Box::new(Stream {
      native: WriteStream {
        write: Some(write),
        close: Some(close),
        free: Some(free),
      },
      target,
      input,
      root,
      clean: mode == 1,
      failed: false,
      closed: None,
    });
    // SAFETY: native is the first repr(C) field. libgit2 calls free exactly once
    // for each successfully created stream; that callback reclaims this Box.
    unsafe { *out = Box::into_raw(state).cast() };
    Ok(())
  })
}

extern "C" fn write(native: *mut WriteStream, buffer: *const c_char, size: usize) -> c_int {
  ffi::boundary(|| {
    if native.is_null() {
      return Err("Git LFS received an invalid input stream".into());
    }
    // SAFETY: libgit2 calls streams serially with a valid native prefix and a
    // readable buffer for this call. Avoid constructing a slice from null at 0.
    let state = unsafe { &mut *native.cast::<Stream>() };
    if state.closed.is_some() || state.failed {
      return Err("Git LFS input stream is no longer writable".into());
    }
    state.failed = true;
    if (size != 0 && buffer.is_null()) || size > isize::MAX as usize {
      return Err("Git LFS received an invalid input buffer".into());
    }
    let bytes = if size == 0 {
      &[]
    } else {
      unsafe { std::slice::from_raw_parts(buffer.cast(), size) }
    };
    if let Err(error) = state.input.write_all(bytes) {
      return Err(format!("Git LFS temporary write failed: {error}"));
    }
    state.failed = false;
    Ok(())
  })
}

extern "C" fn close(native: *mut WriteStream) -> c_int {
  ffi::boundary(|| {
    if native.is_null() {
      return Err("Git LFS received an invalid input stream".into());
    }
    // SAFETY: native is the live stream allocated by our stream callback.
    let state = unsafe { &mut *native.cast::<Stream>() };
    if let Some(result) = state.closed {
      return if result == 0 {
        Ok(())
      } else {
        Err("Git LFS stream already failed".into())
      };
    }
    // Close is terminal, including if transformation panics. A spool write
    // failure must never publish a pointer for truncated input.
    state.closed = Some(-1);
    let result = catch_unwind(AssertUnwindSafe(|| transform(state)))
      .unwrap_or_else(|_| Err("Git LFS filter failed unexpectedly".into()));
    let target_result = ffi::close_target(state.target);
    result.and(target_result)?;
    state.closed = Some(0);
    Ok(())
  })
}

fn transform(state: &mut Stream) -> Result<(), String> {
  if state.failed {
    return Err("Git LFS input was incomplete after a temporary file write failure".into());
  }
  state
    .input
    .rewind()
    .map_err(|error| format!("Git LFS temporary seek failed: {error}"))?;
  let mut output = ffi::Target(state.target);
  let result = if state.clean {
    super::lfs::clean(&state.root, &mut state.input, &mut output)
  } else {
    super::lfs::smudge(&state.root, &mut state.input, &mut output)
  };
  result.map_err(|error| format!("{}: {}", error.code, error.message))
}

extern "C" fn free(native: *mut WriteStream) {
  // A destructor must not unwind across C either. This owns only our tempfile;
  // downstream streams are freed separately by libgit2's filter_streams_free.
  let _ = catch_unwind(AssertUnwindSafe(|| {
    if !native.is_null() {
      // SAFETY: libgit2 calls free once for each Box returned by stream.
      unsafe { drop(Box::from_raw(native.cast::<Stream>())) };
    }
  }));
}

fn path(value: &CStr) -> Result<PathBuf, String> {
  #[cfg(unix)]
  {
    use std::os::unix::ffi::OsStrExt;
    Ok(std::ffi::OsStr::from_bytes(value.to_bytes()).into())
  }
  #[cfg(not(unix))]
  {
    value
      .to_str()
      .map(PathBuf::from)
      .map_err(|_| "Git LFS repository path is not valid UTF-8".into())
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Read;

  #[repr(C)]
  struct Output {
    native: WriteStream,
    closes: usize,
    frees: usize,
  }

  extern "C" fn output_close(native: *mut WriteStream) -> c_int {
    unsafe { (*native.cast::<Output>()).closes += 1 };
    0
  }

  extern "C" fn output_free(native: *mut WriteStream) {
    unsafe { (*native.cast::<Output>()).frees += 1 };
  }

  #[test]
  fn failed_input_is_not_transformed_and_downstream_is_closed_once_but_never_freed() {
    let directory = tempfile::tempdir().unwrap();
    git2::Repository::init(directory.path()).unwrap();
    let mut input = tempfile::tempfile().unwrap();
    input.write_all(b"incomplete binary input").unwrap();
    let mut output = Output {
      native: WriteStream {
        write: None,
        close: Some(output_close),
        free: Some(output_free),
      },
      closes: 0,
      frees: 0,
    };
    let state = Stream {
      native: WriteStream {
        write: Some(write),
        close: Some(close),
        free: Some(free),
      },
      target: &mut output.native,
      input,
      root: directory.path().to_owned(),
      clean: true,
      failed: false,
      closed: None,
    };
    let native = Box::into_raw(Box::new(state)).cast();
    assert_eq!(write(native, std::ptr::null(), 1), -1);
    assert_eq!(close(native), -1);
    assert_eq!(close(native), -1);
    assert_eq!(write(native, c"later".as_ptr(), 5), -1);
    free(native);
    assert_eq!(output.closes, 1);
    assert_eq!(output.frees, 0);
    assert!(!directory.path().join(".git/lfs").exists());
  }

  #[test]
  fn native_writes_are_spooled_without_retaining_the_callers_buffer() {
    let state = Stream {
      native: WriteStream {
        write: Some(write),
        close: Some(close),
        free: Some(free),
      },
      target: std::ptr::null_mut(),
      input: tempfile::tempfile().unwrap(),
      root: PathBuf::new(),
      clean: true,
      failed: false,
      closed: None,
    };
    let native = Box::into_raw(Box::new(state)).cast();
    assert_eq!(write(native, c"one".as_ptr(), 3), 0);
    assert_eq!(write(native, std::ptr::null(), 0), 0);
    assert_eq!(write(native, c"two".as_ptr(), 3), 0);
    let state = unsafe { &mut *native.cast::<Stream>() };
    state.input.rewind().unwrap();
    let mut bytes = Vec::new();
    state.input.read_to_end(&mut bytes).unwrap();
    assert_eq!(bytes, b"onetwo");
    free(native);
  }
}
