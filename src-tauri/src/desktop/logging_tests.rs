use super::*;
use tauri::test::mock_app;

fn file_logger(directory: &std::path::Path, development: bool) -> Box<dyn log::Log> {
  let app = mock_app();
  let (_, _, logger) = configured(development)
    .targets([Target::new(TargetKind::Folder {
      path: directory.into(),
      file_name: Some("main".into()),
    })])
    .split(app.handle())
    .expect("isolated file logger");
  logger
}

#[test]
fn native_file_logging_rotates_five_mib_and_retains_one_archive() {
  let directory = tempfile::tempdir().expect("temporary logs");
  std::fs::write(directory.path().join("main_2000-01-01_00-00-00.log"), "old")
    .expect("old archive");
  std::fs::write(directory.path().join("main_2001-01-01_00-00-00.log"), "old")
    .expect("old archive");
  let unrelated = directory.path().join("unrelated.log");
  std::fs::write(&unrelated, "preserve").expect("unrelated log");
  let logger = file_logger(directory.path(), false);
  let payload = "x".repeat(48 * 1024);
  for index in 0..112 {
    logger.log(
      &log::Record::builder()
        .level(log::Level::Info)
        .target("marklab_desktop::workspace")
        .args(format_args!("checkpoint {index} {payload}"))
        .build(),
    );
  }
  logger.flush();
  let files: Vec<_> = std::fs::read_dir(directory.path())
    .expect("log directory")
    .map(|entry| entry.expect("log entry"))
    .filter(|entry| entry.file_name().to_string_lossy().starts_with("main"))
    .collect();
  assert!(directory.path().join("main.log").is_file());
  assert_eq!(files.len(), 2, "one current file and one archive");
  for file in files {
    assert!(file.metadata().expect("log length").len() <= MAX_FILE_BYTES);
  }
  assert_eq!(
    std::fs::read_to_string(unrelated).expect("unrelated log"),
    "preserve"
  );
}

#[test]
fn packaged_and_development_logs_keep_levels_and_redact_the_actual_file_transport() {
  for development in [false, true] {
    let directory = tempfile::tempdir().expect("temporary logs");
    let logger = file_logger(directory.path(), development);
    for (target, message) in [
      ("marklab_desktop::workspace", "native-debug-marker"),
      ("renderer", "renderer-debug-marker"),
      ("reqwest", "dependency-debug-marker"),
    ] {
      logger.log(
        &log::Record::builder()
          .level(log::Level::Debug)
          .target(target)
          .args(format_args!("{message}"))
          .build(),
      );
    }
    logger.log(
            &log::Record::builder()
                .level(log::Level::Error)
                .target("renderer")
                .args(format_args!(
                    "Authorization: Bearer PRIVATE_BEARER https://user:PRIVATE_PASSWORD@example.test/p?token=PRIVATE_QUERY#PRIVATE_FRAGMENT\nforged-record"
                ))
                .build(),
        );
    logger.log(
      &log::Record::builder()
        .level(log::Level::Error)
        .target("renderer")
        .args(format_args!("safe-error\nforged-record"))
        .build(),
    );
    logger.flush();
    let output = std::fs::read_to_string(directory.path().join("main.log")).expect("written logs");
    assert_eq!(output.contains("native-debug-marker"), development);
    assert_eq!(output.contains("renderer-debug-marker"), development);
    assert!(!output.contains("dependency-debug-marker"));
    for secret in [
      "PRIVATE_BEARER",
      "PRIVATE_PASSWORD",
      "PRIVATE_QUERY",
      "PRIVATE_FRAGMENT",
    ] {
      assert!(!output.contains(secret), "secret leaked: {secret}");
    }
    assert!(!output.contains("\nforged-record"));
    assert!(output.contains("forged-record"));
  }
}

#[test]
fn oversize_unicode_log_records_stop_before_unbounded_formatting() {
  let payload = "中文😀".repeat(10_000);
  let record = bounded(format_args!("{payload}"));
  assert!(record.len() <= MAX_RECORD_BYTES);
  assert!(record.ends_with("[Truncated]"));
  assert!(record.contains("中文😀"));
}

#[test]
fn sdk_completion_payloads_never_enter_the_file_transport() {
  let directory = tempfile::tempdir().expect("temporary logs");
  let logger = file_logger(directory.path(), true);
  for target in ["rig::completions", "rig::streaming"] {
    logger.log(
      &log::Record::builder()
        .level(log::Level::Error)
        .target(target)
        .args(format_args!("PRIVATE_DOCUMENT_CONTENT"))
        .build(),
    );
  }
  logger.log(
    &log::Record::builder()
      .level(log::Level::Info)
      .target("marklab_desktop::ai")
      .args(format_args!("generation-completed"))
      .build(),
  );
  logger.flush();
  let output = std::fs::read_to_string(directory.path().join("main.log")).expect("written logs");
  assert!(output.contains("generation-completed"));
  assert!(!output.contains("PRIVATE_DOCUMENT_CONTENT"));
}
