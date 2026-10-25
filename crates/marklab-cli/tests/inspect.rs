use serde_json::Value;
use std::{
  fs,
  io::Write,
  path::Path,
  process::{Command, Output, Stdio},
};

fn run(root: &Path, args: &[&str], input: Option<&str>) -> Output {
  let mut child = Command::new(env!("CARGO_BIN_EXE_marklab"))
    .current_dir(root)
    .args(args)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .unwrap();
  if let Some(input) = input {
    child
      .stdin
      .take()
      .unwrap()
      .write_all(input.as_bytes())
      .unwrap();
  }
  drop(child.stdin.take());
  child.wait_with_output().unwrap()
}

#[test]
fn inspect_reports_unicode_headings_duplicate_slugs_links_and_utf16_positions() {
  let root = tempfile::tempdir().unwrap();
  let line = "😀 [文档](other.md#标题) [[Wiki|显示]]";
  let content = format!("# 中文 🦀\n# 中文 🦀\n{line}\n");
  fs::write(root.path().join("document.md"), &content).unwrap();
  let output = run(root.path(), &["inspect", "document.md", "--quiet"], None);
  assert!(
    output.status.success(),
    "{}",
    String::from_utf8_lossy(&output.stderr)
  );
  assert!(output.stderr.is_empty());
  let document: Value = serde_json::from_slice(&output.stdout).unwrap();
  assert_eq!(document["title"], "中文 🦀");
  assert_eq!(document["content"], content);
  assert_eq!(document["headings"][0]["slug"], "中文-");
  assert_eq!(document["headings"][1]["slug"], "中文--1");
  assert_eq!(document["links"][0]["target"], "other.md#标题");
  assert_eq!(document["links"][0]["line"], 3);
  let expected_column = line[..line.find("other").unwrap()].encode_utf16().count() + 1;
  assert_eq!(document["links"][0]["column"], expected_column);
  assert_eq!(document["links"][1]["target"], "Wiki");
  assert_eq!(document["links"][1]["link_type"], "wiki");
}

#[test]
fn ast_from_stdin_is_structured_json_and_preserves_code() {
  let root = tempfile::tempdir().unwrap();
  let output = run(
    root.path(),
    &["inspect", "-", "--ast", "--quiet"],
    Some("# Heading\n\n`code`\n"),
  );
  assert!(
    output.status.success(),
    "{}",
    String::from_utf8_lossy(&output.stderr)
  );
  assert!(output.stderr.is_empty());
  let nodes: Value = serde_json::from_slice(&output.stdout).unwrap();
  assert_eq!(nodes[0]["Element"][0]["Heading"], 1);
  assert_eq!(nodes[0]["Element"][1][0]["Text"], "Heading");
  assert_eq!(nodes[1]["Element"][1][0]["Code"], "code");
}

#[test]
fn piped_progress_is_plain_text_and_quiet_suppresses_success_messages() {
  let root = tempfile::tempdir().unwrap();
  fs::write(root.path().join("source.md"), "# Heading").unwrap();
  let output = run(
    root.path(),
    &[
      "export",
      "source.md",
      "--format",
      "html",
      "--output",
      "-",
      "--no-progress",
    ],
    None,
  );
  assert!(output.status.success());
  assert!(!output.stderr.contains(&0x1b));
  assert!(String::from_utf8_lossy(&output.stderr).contains("succeeded"));
  assert!(output.stdout.starts_with(b"<!doctype html>"));
  let quiet = run(
    root.path(),
    &[
      "export",
      "source.md",
      "--format",
      "txt",
      "--output",
      "-",
      "--quiet",
    ],
    None,
  );
  assert!(quiet.status.success());
  assert!(quiet.stderr.is_empty());
  assert!(String::from_utf8_lossy(&quiet.stdout).contains("Heading"));
}

#[test]
fn stdin_images_require_an_explicit_resource_root() {
  let root = tempfile::tempdir().unwrap();
  let output = run(
    root.path(),
    &["export", "-", "--format", "html", "--output", "-"],
    Some("![image](image.png)"),
  );
  assert!(!output.status.success());
  assert!(output.stdout.is_empty());
  assert!(String::from_utf8_lossy(&output.stderr).contains("--resource-root"));
}

#[test]
fn output_case_collisions_and_file_directory_conflicts_are_detected_before_writes() {
  let root = tempfile::tempdir().unwrap();
  fs::create_dir_all(root.path().join("docs/a.html")).unwrap();
  fs::write(root.path().join("docs/a.md"), "A").unwrap();
  fs::write(root.path().join("docs/A.markdown"), "B").unwrap();
  let collision = run(
    root.path(),
    &["export", "docs", "--format", "html", "--output", "out"],
    None,
  );
  assert!(!collision.status.success());
  assert!(!root.path().join("out").exists());
  fs::remove_file(root.path().join("docs/A.markdown")).unwrap();
  fs::write(root.path().join("docs/a.html/nested.md"), "Nested").unwrap();
  let prefix = run(
    root.path(),
    &[
      "export",
      "docs",
      "--format",
      "html",
      "--output",
      "out",
      "--recursive",
    ],
    None,
  );
  assert!(!prefix.status.success());
  assert!(!root.path().join("out").exists());
}
