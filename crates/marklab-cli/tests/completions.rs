use std::process::Command;

#[test]
fn zsh_completion_script_includes_commands_flags_formats_and_path_hints() {
  let output = Command::new(env!("CARGO_BIN_EXE_marklab"))
    .args(["completions", "zsh"])
    .output()
    .unwrap();
  assert!(
    output.status.success(),
    "{}",
    String::from_utf8_lossy(&output.stderr)
  );
  assert!(output.stderr.is_empty());
  let script = String::from_utf8(output.stdout).unwrap();
  assert!(script.starts_with("#compdef marklab"));
  assert!(script.contains("_marklab()"));
  for command in ["export", "publish", "inspect", "completions"] {
    assert!(script.contains(command), "missing {command}");
  }
  for option in [
    "--format",
    "--jobs",
    "--resource-root",
    "--recursive",
    "--quiet",
    "--ast",
  ] {
    assert!(script.contains(option), "missing {option}");
  }
  for format in ["html", "txt", "epub", "pdf", "docx", "markdown"] {
    assert!(script.contains(format), "missing {format}");
  }
  assert!(script.contains("_files"));
  assert!(!script.contains("\u{1b}"));
}

#[test]
fn supported_shells_generate_scripts_and_invalid_shells_are_typed_errors() {
  for shell in ["bash", "fish", "powershell", "elvish"] {
    let output = Command::new(env!("CARGO_BIN_EXE_marklab"))
      .args(["completions", shell])
      .output()
      .unwrap();
    assert!(
      output.status.success(),
      "{shell}: {}",
      String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stderr.is_empty());
    assert!(String::from_utf8_lossy(&output.stdout).contains("marklab"));
  }
  let output = Command::new(env!("CARGO_BIN_EXE_marklab"))
    .args(["completions", "unknown"])
    .output()
    .unwrap();
  assert_eq!(output.status.code(), Some(2));
  assert!(output.stdout.is_empty());
  let error = String::from_utf8(output.stderr).unwrap();
  assert!(error.contains("invalid value"));
  assert!(error.contains("zsh"));
}
