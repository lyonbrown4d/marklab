use super::*;
use tauri::test::{MockRuntime, mock_builder, mock_context, noop_assets};

fn app() -> tauri::App<MockRuntime> {
  let config: Value = serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
  let mut context = mock_context(noop_assets());
  context
    .config_mut()
    .plugins
    .0
    .insert("cli".into(), config["plugins"]["cli"].clone());
  mock_builder()
    .plugin(tauri_plugin_cli::init())
    .build(context)
    .unwrap()
}

async fn request(
  app: &tauri::App<MockRuntime>,
  args: &[&str],
  cwd: &Path,
) -> BackendResult<Outcome> {
  prepare(
    app.handle(),
    std::iter::once("marklab")
      .chain(args.iter().copied())
      .map(String::from)
      .collect(),
    cwd,
  )
  .await
}

#[tokio::test]
async fn explicit_and_positional_targets_use_the_sending_process_directory() {
  let app = app();
  let sender = tempfile::tempdir().unwrap();
  let workspace = sender.path().join("space workspace");
  tokio::fs::create_dir(&workspace).await.unwrap();
  let file = sender.path().join("space note.md");
  tokio::fs::write(&file, "# note").await.unwrap();
  for args in [
    vec!["--workspace", "space workspace"],
    vec!["-w", "space workspace"],
    vec!["--workspace=space workspace"],
  ] {
    let Outcome::Open(paths) = request(&app, &args, sender.path()).await.unwrap() else {
      panic!("expected workspace")
    };
    assert_eq!(paths, vec![workspace.to_string_lossy()]);
  }
  for args in [
    vec!["--file", "space note.md"],
    vec!["-f", "space note.md"],
    vec!["--file=space note.md"],
  ] {
    let Outcome::Open(paths) = request(&app, &args, sender.path()).await.unwrap() else {
      panic!("expected file")
    };
    assert_eq!(paths, vec![file.to_string_lossy()]);
  }
  let Outcome::Open(paths) = request(
    &app,
    &["space note.md", "space workspace", "space note.md"],
    sender.path(),
  )
  .await
  .unwrap() else {
    panic!("expected paths")
  };
  assert_eq!(
    paths,
    vec![file.to_string_lossy(), workspace.to_string_lossy()]
  );
}

#[tokio::test]
async fn positional_targets_accept_script_extensions_for_files_and_directories_in_order() {
  let app = app();
  let sender = tempfile::tempdir().unwrap();
  let mut arguments = Vec::new();
  let mut expected = Vec::new();
  for extension in ["js", "mjs", "cjs", "asar"] {
    let file = format!("space note.{extension}");
    let directory = format!("space workspace.{extension}");
    tokio::fs::write(sender.path().join(&file), "note")
      .await
      .unwrap();
    tokio::fs::create_dir(sender.path().join(&directory))
      .await
      .unwrap();
    for value in [file, directory] {
      expected.push(sender.path().join(&value).to_string_lossy().into_owned());
      arguments.push(value);
    }
  }
  for separator in [false, true] {
    let mut values = arguments.iter().map(String::as_str).collect::<Vec<_>>();
    if separator {
      values.insert(0, "--");
    }
    let Outcome::Open(paths) = request(&app, &values, sender.path()).await.unwrap() else {
      panic!("expected positional paths")
    };
    assert_eq!(paths, expected);
  }
}

#[tokio::test]
async fn invalid_or_ambiguous_arguments_do_not_turn_into_default_workspace_requests() {
  let app = app();
  let sender = tempfile::tempdir().unwrap();
  let file = sender.path().join("note.md");
  tokio::fs::write(file, "note").await.unwrap();
  for args in [
    vec!["--unknown"],
    vec!["--workspace"],
    vec!["--file"],
    vec!["--workspace", ".", "--file", "note.md"],
    vec!["--workspace", ".", "note.md"],
    vec!["--file", "note.md", "."],
  ] {
    assert_eq!(
      request(&app, &args, sender.path()).await.unwrap_err().code,
      "CLI_ARGUMENT_ERROR"
    );
  }
  for args in [
    vec!["--workspace", "note.md"],
    vec!["--file", "."],
    vec!["missing.md"],
    vec!["missing.js"],
  ] {
    assert_eq!(
      request(&app, &args, sender.path()).await.unwrap_err().code,
      "CLI_TARGET_ERROR"
    );
  }
}

#[tokio::test]
async fn help_and_version_are_terminal_outputs_without_validating_or_opening_targets() {
  let app = app();
  for flag in ["--help", "-h", "--version", "-V"] {
    let Outcome::Output(output) = request(&app, &[flag], Path::new("/missing-cwd"))
      .await
      .unwrap()
    else {
      panic!("expected terminal output")
    };
    assert!(!output.is_empty());
    if flag == "--help" {
      assert!(output.contains("--workspace"));
      assert!(output.contains("--file"));
      assert!(output.contains("separate windows"));
      assert!(output.contains("mcp"));
    }
  }
}

#[tokio::test]
async fn native_links_stay_out_of_filesystem_targets_and_preserve_positional_separator() {
  let app = app();
  let sender = tempfile::tempdir().unwrap();
  tokio::fs::write(sender.path().join("-note.md"), "note")
    .await
    .unwrap();
  let Outcome::Open(paths) = request(
    &app,
    &["marklab://open?path=note.md", "--", "-note.md"],
    sender.path(),
  )
  .await
  .unwrap() else {
    panic!("expected paths")
  };
  assert_eq!(
    paths,
    vec![sender.path().join("-note.md").to_string_lossy()]
  );
  let Outcome::Open(paths) = request(&app, &[], sender.path()).await.unwrap() else {
    panic!("expected default request")
  };
  assert!(paths.is_empty());
}

#[cfg(target_os = "macos")]
#[test]
fn finder_process_serial_number_is_ignored_only_before_the_positional_separator() {
  let args = ["marklab", "-psn_0_123", "--", "-psn_0_456"]
    .map(String::from)
    .to_vec();
  assert_eq!(platform_arguments(args), ["marklab", "--", "-psn_0_456"]);
  assert_eq!(
    platform_arguments(
      [
        "marklab",
        "-NSDocumentRevisionsDebugMode",
        "YES",
        "-ApplePersistenceIgnoreState",
        "NO"
      ]
      .map(String::from)
      .to_vec()
    ),
    ["marklab"]
  );
  assert_eq!(
    platform_arguments(
      ["marklab", "-NSDocumentRevisionsDebugMode", "unexpected"]
        .map(String::from)
        .to_vec()
    ),
    ["marklab", "-NSDocumentRevisionsDebugMode", "unexpected"]
  );
  for value in ["-psn_", "-psn_0_", "-psn_0_bad", "-psn_0_12_extra"] {
    assert!(!is_process_serial_number(value));
  }
}

#[tokio::test]
async fn missing_cli_plugin_returns_an_error_instead_of_panicking() {
  let app = mock_builder().build(mock_context(noop_assets())).unwrap();
  assert_eq!(
    request(&app, &[], Path::new("/")).await.unwrap_err().code,
    "CLI_UNAVAILABLE"
  );
}
