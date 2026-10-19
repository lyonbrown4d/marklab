use super::log_redaction::sanitize;
use std::{fmt, sync::Once};
use tauri_plugin_log::{FileOpenStrategy, RotationStrategy, Target, TargetKind, TimezoneStrategy};

const MAX_RECORD_BYTES: usize = 56 * 1024;
const MAX_FILE_BYTES: u128 = 5 * 1024 * 1024;

pub(super) fn builder() -> crate::error::BackendResult<tauri_plugin_log::Builder> {
  let builder = configured(cfg!(debug_assertions));
  #[cfg(all(feature = "e2e-testing", debug_assertions))]
  let builder = {
    let cache = std::env::var_os("MARKLAB_E2E_CACHE_DIR")
      .map(std::path::PathBuf::from)
      .filter(|path| path.is_absolute())
      .ok_or_else(|| {
        crate::error::BackendError::new(
          "E2E_PATHS_INVALID",
          "Native E2E logging requires an isolated absolute cache directory",
        )
      })?;
    builder.targets([
      Target::new(TargetKind::Stdout),
      Target::new(TargetKind::Folder {
        path: cache.join("logs"),
        file_name: Some("main".into()),
      }),
    ])
  };
  Ok(builder)
}

fn configured(development: bool) -> tauri_plugin_log::Builder {
  let level = if development {
    log::LevelFilter::Debug
  } else {
    log::LevelFilter::Info
  };
  tauri_plugin_log::Builder::new()
    // Keep dependency diagnostics at warning level so HTTP/SQL debug
    // payloads cannot expose document content or credentials.
    .level(log::LevelFilter::Warn)
    .level_for("marklab_desktop", level)
    .level_for("renderer", level)
    // Rig's completion traces can include entire prompts and responses.
    // They remain disabled even if application logging becomes more verbose.
    .level_for("rig::completions", log::LevelFilter::Off)
    .level_for("rig::streaming", log::LevelFilter::Off)
    .max_file_size(MAX_FILE_BYTES)
    .rotation_strategy(RotationStrategy::KeepSome(1))
    .file_open_strategy(FileOpenStrategy::Append)
    .timezone_strategy(TimezoneStrategy::UseLocal)
    .targets([
      Target::new(TargetKind::Stdout),
      Target::new(TargetKind::LogDir {
        file_name: Some("main".into()),
      }),
    ])
    .format(|out, message, record| {
      let text = sanitize(&bounded(*message));
      let scope = sanitize(record.target());
      out.finish(format_args!(
        "[{}] [{}] [{}] {}",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
        record.level().as_str().to_lowercase(),
        scope,
        text,
      ));
    })
}

// Bound formatting itself, before redaction or the file transport allocates a
// record. Returning fmt::Error stops standard Display/Debug traversal early.
fn bounded(arguments: fmt::Arguments<'_>) -> String {
  struct Record(String);
  impl fmt::Write for Record {
    fn write_str(&mut self, value: &str) -> fmt::Result {
      let remaining = (MAX_RECORD_BYTES - 11).saturating_sub(self.0.len());
      if value.len() <= remaining {
        self.0.push_str(value);
        return Ok(());
      }
      let mut end = remaining.min(value.len());
      while !value.is_char_boundary(end) {
        end -= 1;
      }
      self.0.push_str(&value[..end]);
      self.0.push_str("[Truncated]");
      Err(fmt::Error)
    }
  }
  let mut record = Record(String::new());
  let _ = fmt::write(&mut record, arguments);
  record.0
}

pub(super) fn install_panic_hook() {
  static INSTALL: Once = Once::new();
  INSTALL.call_once(|| {
    std::panic::set_hook(Box::new(|info| {
      let message = info
        .payload()
        .downcast_ref::<String>()
        .map(String::as_str)
        .or_else(|| info.payload().downcast_ref::<&str>().copied())
        .unwrap_or("Unknown native panic");
      let location = info.location().map(|location| {
        format!(
          "{}:{}:{}",
          location.file(),
          location.line(),
          location.column()
        )
      });
      let backtrace = std::backtrace::Backtrace::force_capture();
      let fields = serde_json::json!({
          "message": sanitize(&bounded(format_args!("{message}"))),
          "location": location,
          "stack": sanitize(&bounded(format_args!("{backtrace}"))),
      });
      log::error!(target: "marklab_desktop::panic", "uncaught-panic {fields}");
      log::logger().flush();
    }));
  });
}

pub(crate) fn report_startup_failure(error: &crate::error::BackendError) {
  let message = sanitize(&bounded(format_args!("{error}")));
  log::error!(target: "marklab_desktop::app", "native-start-failed {message}");
  log::logger().flush();
  eprintln!("Marklab could not start: {message}");
}

#[cfg(test)]
#[path = "logging_tests.rs"]
mod tests;
