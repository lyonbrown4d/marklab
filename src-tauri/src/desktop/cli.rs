use crate::error::{BackendError, BackendResult};
use clap::{CommandFactory, FromArgMatches, Parser, error::ErrorKind};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

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

#[derive(Parser)]
#[command(
  about = "Open a Marklab workspace or document.",
  after_help = "Use --workspace for one directory or --file for one document. Named targets cannot be combined. Supply multiple positional paths to open them in separate windows. Relative paths use the calling process working directory. Use -- before paths beginning with a hyphen. The mcp subcommand starts the existing MCP stdio service instead of the desktop app."
)]
struct Arguments {
  /// Open an existing workspace directory
  #[arg(short, long, conflicts_with_all = ["file", "paths"])]
  workspace: Option<String>,
  /// Open an existing document file
  #[arg(short, long, conflicts_with_all = ["workspace", "paths"])]
  file: Option<String>,
  /// Existing files or directories to open in separate windows
  #[arg(num_args = 1..)]
  paths: Vec<String>,
}

// Parse before initializing the desktop runtime: Chromium also consumes command
// line flags, and terminal requests must never create a webview or splash window.
pub(super) async fn prepare_arguments(
  args: Vec<String>,
  cwd: &Path,
  package: &tauri::PackageInfo,
) -> BackendResult<Outcome> {
  let command = Arguments::command()
    .name(package.name.clone())
    .bin_name(package.name.clone())
    .version(package.version.to_string());
  let matches = match command.try_get_matches_from(platform_arguments(args)) {
    Ok(matches) => matches,
    Err(error)
      if matches!(
        error.kind(),
        ErrorKind::DisplayHelp | ErrorKind::DisplayVersion
      ) =>
    {
      return Ok(Outcome::Output(
        error.to_string().trim_end_matches('\n').into(),
      ));
    }
    Err(error) => return Err(BackendError::new("CLI_ARGUMENT_ERROR", error.to_string())),
  };
  let arguments = Arguments::from_arg_matches(&matches)
    .map_err(|error| BackendError::new("CLI_ARGUMENT_ERROR", error.to_string()))?;
  resolve(targets(arguments), cwd).await.map(Outcome::Open)
}

pub(super) async fn prepare<R: Runtime>(
  app: &AppHandle<R>,
  args: Vec<String>,
  cwd: &Path,
) -> BackendResult<Outcome> {
  prepare_arguments(args, cwd, app.package_info()).await
}

pub(super) async fn prepare_forwarded<R: Runtime>(
  app: &AppHandle<R>,
  args: Vec<String>,
  cwd: &Path,
) -> BackendResult<Outcome> {
  prepare(app, args, cwd).await
}

fn targets(arguments: Arguments) -> Vec<Target> {
  let mut targets = Vec::new();
  for (value, kind) in [
    (arguments.workspace, TargetKind::Workspace),
    (arguments.file, TargetKind::File),
  ] {
    if let Some(value) = value {
      targets.push(Target { value, kind });
    }
  }
  targets.extend(
    arguments
      .paths
      .into_iter()
      .filter(|value| !is_deep_link_argument(value))
      .map(|value| Target {
        value,
        kind: TargetKind::Positional,
      }),
  );
  targets
}

fn is_deep_link_argument(value: &str) -> bool {
  // Native launch handling delivers URLs independently of filesystem targets.
  value.contains("://") && !is_file_url(value)
}

fn is_file_url(value: &str) -> bool {
  cfg!(target_os = "linux")
    && value
      .get(..7)
      .is_some_and(|prefix| prefix.eq_ignore_ascii_case("file://"))
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
    let path = if is_file_url(&target.value) {
      url::Url::parse(&target.value)
        .ok()
        .filter(|url| {
          url
            .host_str()
            .is_none_or(|host| host.eq_ignore_ascii_case("localhost"))
        })
        .and_then(|url| url.to_file_path().ok())
        .ok_or_else(|| {
          BackendError::new(
            "CLI_TARGET_ERROR",
            "A file URL must identify a local filesystem path",
          )
        })?
    } else {
      PathBuf::from(&target.value)
    };
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
  if let Some(dialog) = app.try_state::<tauri_plugin_dialog::Dialog<tauri::DynRuntime>>() {
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
