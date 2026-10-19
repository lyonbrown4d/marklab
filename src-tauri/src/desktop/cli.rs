use crate::error::{BackendError, BackendResult};
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_cli::{Cli, Matches};

pub(super) struct LaunchArguments(pub Vec<String>);

#[derive(Debug)]
pub(super) enum Outcome {
  Open(Vec<String>),
  Output(String),
}

#[derive(Clone, Copy, Debug)]
enum TargetKind {
  Workspace,
  File,
  Positional,
}

#[derive(Debug)]
struct Target {
  value: String,
  kind: TargetKind,
}

pub(super) async fn prepare<R: Runtime>(
  app: &AppHandle<R>,
  args: Vec<String>,
  cwd: &Path,
) -> BackendResult<Outcome> {
  let cli = app.try_state::<Cli<R>>().ok_or_else(|| {
    BackendError::new(
      "CLI_UNAVAILABLE",
      "The command-line plugin is not initialized",
    )
  })?;
  let matches = cli
    .matches_from(platform_arguments(args))
    .map_err(|error| BackendError::new("CLI_ARGUMENT_ERROR", error.to_string()))?;
  if let Some(output) = terminal_output(&matches, app.package_info()) {
    return Ok(Outcome::Output(output));
  }
  resolve(targets(&matches), cwd).await.map(Outcome::Open)
}

pub(super) async fn prepare_forwarded<R: Runtime>(
  app: &AppHandle<R>,
  args: Vec<String>,
  cwd: &Path,
) -> BackendResult<Outcome> {
  // A Windows WM_COPYDATA callback can reenter the main thread during build,
  // before the following CLI plugin has installed its managed state.
  tokio::time::timeout(std::time::Duration::from_secs(5), async {
    while app.try_state::<Cli<R>>().is_none() {
      tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
  })
  .await
  .map_err(|_| {
    BackendError::new(
      "CLI_UNAVAILABLE",
      "Command-line plugin initialization timed out",
    )
  })?;
  prepare(app, args, cwd).await
}

fn terminal_output(matches: &Matches, package: &tauri::PackageInfo) -> Option<String> {
  matches
    .args
    .get("help")
    .and_then(|argument| argument.value.as_str())
    .map(String::from)
    .or_else(|| {
      matches
        .args
        .contains_key("version")
        .then(|| format!("{} {}", package.name, package.version))
    })
}

fn targets(matches: &Matches) -> Vec<Target> {
  let mut targets = Vec::new();
  for (name, kind) in [
    ("workspace", TargetKind::Workspace),
    ("file", TargetKind::File),
    ("paths", TargetKind::Positional),
  ] {
    let Some(argument) = matches.args.get(name) else {
      continue;
    };
    let values = match &argument.value {
      Value::String(value) => vec![value.as_str()],
      Value::Array(values) => values.iter().filter_map(Value::as_str).collect(),
      _ => continue,
    };
    for value in values {
      if matches!(kind, TargetKind::Positional) && is_deep_link_argument(value) {
        continue;
      }
      targets.push(Target {
        value: value.into(),
        kind,
      });
    }
  }
  targets
}

fn is_deep_link_argument(value: &str) -> bool {
  // Native launch handling delivers URLs independently of filesystem targets.
  value.contains("://")
}

async fn resolve(targets: Vec<Target>, cwd: &Path) -> BackendResult<Vec<String>> {
  let mut paths = Vec::new();
  for target in targets {
    if target.value.is_empty() || target.value.contains('\0') {
      return Err(BackendError::new(
        "CLI_TARGET_ERROR",
        "An open target must be a nonempty filesystem path",
      ));
    }
    let path = PathBuf::from(&target.value);
    if !path.is_absolute() && !cwd.is_absolute() {
      return Err(BackendError::new(
        "CLI_TARGET_ERROR",
        "The calling process working directory is unavailable; use an absolute target path",
      ));
    }
    let path = if path.is_absolute() {
      path
    } else {
      cwd.join(path)
    };
    let metadata = tokio::fs::metadata(&path).await.map_err(|error| {
      BackendError::new(
        "CLI_TARGET_ERROR",
        format!("Cannot open '{}': {error}", path.display()),
      )
    })?;
    let valid = match target.kind {
      TargetKind::Workspace => metadata.is_dir(),
      TargetKind::File => metadata.is_file(),
      TargetKind::Positional => metadata.is_dir() || metadata.is_file(),
    };
    if !valid {
      let expected = match target.kind {
        TargetKind::Workspace => "a directory for --workspace",
        TargetKind::File => "a file for --file",
        TargetKind::Positional => "a file or directory",
      };
      return Err(BackendError::new(
        "CLI_TARGET_ERROR",
        format!("'{}' must be {expected}", path.display()),
      ));
    }
    let path = path.to_string_lossy().into_owned();
    if !paths.contains(&path) {
      paths.push(path);
    }
  }
  Ok(paths)
}

fn platform_arguments(args: Vec<String>) -> Vec<String> {
  #[cfg(target_os = "macos")]
  {
    let mut positional_only = false;
    let mut args = args.into_iter();
    let mut filtered = args.next().into_iter().collect::<Vec<_>>();
    let mut args = args.peekable();
    while let Some(value) = args.next() {
      if !positional_only && is_process_serial_number(&value) {
        continue;
      }
      // Xcode/Finder can supply these AppKit defaults as exact key/value pairs.
      if !positional_only
        && matches!(
          value.as_str(),
          "-NSDocumentRevisionsDebugMode" | "-ApplePersistenceIgnoreState"
        )
        && args
          .peek()
          .is_some_and(|next| matches!(next.as_str(), "YES" | "NO"))
      {
        let _ = args.next();
        continue;
      }
      if value == "--" {
        positional_only = true;
      }
      filtered.push(value);
    }
    filtered
  }
  #[cfg(not(target_os = "macos"))]
  args
}

#[cfg(target_os = "macos")]
fn is_process_serial_number(value: &str) -> bool {
  value
    .strip_prefix("-psn_")
    .and_then(|value| value.split_once('_'))
    .is_some_and(|(high, low)| {
      !high.is_empty()
        && !low.is_empty()
        && high.bytes().all(|byte| byte.is_ascii_digit())
        && low.bytes().all(|byte| byte.is_ascii_digit())
    })
}

pub(super) fn report_forward_error(app: &AppHandle, error: &BackendError) {
  log::warn!("Forwarded command line rejected: {}", error.code);
  eprintln!(
    "Marklab could not open the requested target: {}",
    error.message
  );
  // Initialization failure can also precede the dialog plugin's registration.
  if let Some(dialog) = app.try_state::<tauri_plugin_dialog::Dialog<tauri::Wry>>() {
    dialog
      .message(&error.message)
      .title("Marklab — Invalid command line")
      .kind(tauri_plugin_dialog::MessageDialogKind::Error)
      .show(|_| {});
  }
}

#[cfg(test)]
#[path = "cli_tests.rs"]
mod tests;
