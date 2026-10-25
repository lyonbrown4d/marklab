use std::{
  fs,
  io::Write,
  path::Path,
  process::{Command, Output, Stdio},
};

fn run(root: &Path, args: &[&str]) -> Output {
  Command::new(env!("CARGO_BIN_EXE_marklab"))
    .current_dir(root)
    .args(args)
    .output()
    .unwrap()
}

fn success(output: &Output) {
  assert!(
    output.status.success(),
    "{}",
    String::from_utf8_lossy(&output.stderr)
  );
}

#[test]
fn recursive_export_mirrors_tree_filters_output_and_rewrites_document_links() {
  let root = tempfile::tempdir().unwrap();
  fs::create_dir_all(root.path().join("docs/nested")).unwrap();
  fs::create_dir_all(root.path().join("docs/out")).unwrap();
  fs::write(
    root.path().join("docs/intro.md"),
    "# Intro\n[Next](nested/next.md)\n[Reference][r]\n\n[r]: nested/next.md",
  )
  .unwrap();
  fs::write(
    root.path().join("docs/nested/next.md"),
    "# Next\n[Back](../intro.md)",
  )
  .unwrap();
  fs::write(root.path().join("docs/nested/skip.md"), "Excluded").unwrap();
  fs::write(
    root.path().join("docs/out/stale.md"),
    "Must not scan output",
  )
  .unwrap();
  let result = run(
    root.path(),
    &[
      "export",
      "docs",
      "--format",
      "html",
      "--output",
      "docs/out",
      "--recursive",
      "--exclude",
      "**/skip.md",
    ],
  );
  success(&result);
  assert!(result.stdout.is_empty());
  let intro = fs::read_to_string(root.path().join("docs/out/intro.html")).unwrap();
  assert!(intro.contains("href=\"nested/next.html\""));
  assert!(intro.contains(">Reference</a>"));
  let next = fs::read_to_string(root.path().join("docs/out/nested/next.html")).unwrap();
  assert!(next.contains("href=\"../intro.html\""));
  assert!(!root.path().join("docs/out/nested/skip.html").exists());
  assert!(!root.path().join("docs/out/out").exists());
}

#[test]
fn publish_manifest_preserves_order_metadata_and_internal_links() {
  let root = tempfile::tempdir().unwrap();
  fs::write(
    root.path().join("first.md"),
    "FIRST_BODY\n[Next](second.md)",
  )
  .unwrap();
  fs::write(root.path().join("second.md"), "SECOND_BODY").unwrap();
  fs::write(root.path().join("book.toml"), "title = 'My Book'\nlocale = 'zh-CN'\n[[chapters]]\npath = 'second.md'\ntitle = 'Second'\n[[chapters]]\npath = 'first.md'\ntitle = 'First'\n").unwrap();
  let result = run(
    root.path(),
    &[
      "publish",
      "book.toml",
      "--format",
      "html",
      "--output",
      "book.html",
    ],
  );
  success(&result);
  let book = fs::read_to_string(root.path().join("book.html")).unwrap();
  assert!(book.contains("<title>My Book</title>"));
  assert!(book.contains("lang=\"zh-CN\""));
  assert!(book.find("SECOND_BODY").unwrap() < book.find("FIRST_BODY").unwrap());
  assert!(book.contains("href=\"#chapter-0\">Next</a>"));
}

#[test]
fn publish_directory_uses_natural_relative_path_order() {
  let root = tempfile::tempdir().unwrap();
  fs::create_dir(root.path().join("docs")).unwrap();
  for number in [10, 2, 1] {
    fs::write(
      root.path().join(format!("docs/{number}.md")),
      format!("CHAPTER_{number}_END"),
    )
    .unwrap();
  }
  success(&run(
    root.path(),
    &[
      "publish", "docs", "--format", "markdown", "--output", "book.md",
    ],
  ));
  let book = fs::read_to_string(root.path().join("book.md")).unwrap();
  assert!(book.find("CHAPTER_1_END").unwrap() < book.find("CHAPTER_2_END").unwrap());
  assert!(book.find("CHAPTER_2_END").unwrap() < book.find("CHAPTER_10_END").unwrap());
}

#[test]
fn stdin_stdout_contains_only_text_and_binary_stdout_is_rejected() {
  let root = tempfile::tempdir().unwrap();
  let mut child = Command::new(env!("CARGO_BIN_EXE_marklab"))
    .current_dir(root.path())
    .args(["export", "-", "--format", "markdown", "--output", "-"])
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .unwrap();
  child
    .stdin
    .take()
    .unwrap()
    .write_all(b"# Standard input\n")
    .unwrap();
  let output = child.wait_with_output().unwrap();
  success(&output);
  assert_eq!(output.stdout, b"# Standard input\n");
  let binary = run(
    root.path(),
    &["export", "-", "--format", "epub", "--output", "-"],
  );
  assert!(!binary.status.success());
  assert!(binary.stdout.is_empty());
}

#[test]
fn preflight_rejects_collisions_overwrites_and_source_outputs_without_writes() {
  let root = tempfile::tempdir().unwrap();
  fs::create_dir(root.path().join("docs")).unwrap();
  fs::write(root.path().join("docs/a.md"), "ORIGINAL").unwrap();
  fs::write(root.path().join("docs/a.markdown"), "OTHER").unwrap();
  let conflict = run(
    root.path(),
    &["export", "docs", "--format", "html", "--output", "out"],
  );
  assert!(!conflict.status.success());
  assert!(!root.path().join("out").exists());
  fs::write(root.path().join("existing.html"), "KEEP").unwrap();
  let exists = run(
    root.path(),
    &[
      "export",
      "docs/a.md",
      "--format",
      "html",
      "--output",
      "existing.html",
    ],
  );
  assert!(!exists.status.success());
  assert_eq!(
    fs::read_to_string(root.path().join("existing.html")).unwrap(),
    "KEEP"
  );
  success(&run(
    root.path(),
    &[
      "export",
      "docs/a.md",
      "--format",
      "html",
      "--output",
      "existing.html",
      "--overwrite",
    ],
  ));
  assert!(
    fs::read_to_string(root.path().join("existing.html"))
      .unwrap()
      .contains("ORIGINAL")
  );
  let source = run(
    root.path(),
    &[
      "export",
      "docs/a.md",
      "--format",
      "markdown",
      "--output",
      "docs/a.md",
      "--overwrite",
    ],
  );
  assert!(!source.status.success());
  assert_eq!(
    fs::read_to_string(root.path().join("docs/a.md")).unwrap(),
    "ORIGINAL"
  );
}

#[test]
fn batch_reports_file_errors_and_still_exports_valid_documents() {
  let root = tempfile::tempdir().unwrap();
  fs::create_dir(root.path().join("docs")).unwrap();
  fs::write(root.path().join("docs/good.md"), "Good").unwrap();
  fs::write(root.path().join("docs/bad.md"), [0xff, 0xfe]).unwrap();
  let output = run(
    root.path(),
    &["export", "docs", "--format", "txt", "--output", "out"],
  );
  assert!(!output.status.success());
  assert!(String::from_utf8_lossy(&output.stderr).contains("1 document(s) failed"));
  assert!(
    fs::read_to_string(root.path().join("out/good.txt"))
      .unwrap()
      .contains("Good")
  );
  assert!(!root.path().join("out/bad.txt").exists());
}

#[cfg(unix)]
#[test]
fn local_images_and_symlinks_cannot_escape_resource_root() {
  use std::os::unix::fs::symlink;
  let root = tempfile::tempdir().unwrap();
  fs::create_dir(root.path().join("docs")).unwrap();
  fs::write(root.path().join("secret.png"), b"PRIVATE").unwrap();
  symlink(
    root.path().join("secret.png"),
    root.path().join("docs/leak.png"),
  )
  .unwrap();
  fs::write(root.path().join("docs/a.md"), "![escape](leak.png)").unwrap();
  let symlink_result = run(
    root.path(),
    &[
      "export",
      "docs/a.md",
      "--format",
      "html",
      "--output",
      "a.html",
    ],
  );
  assert!(!symlink_result.status.success());
  assert!(!root.path().join("a.html").exists());
  fs::write(
    root.path().join("docs/a.md"),
    "![escape](%2e%2e/secret.png)",
  )
  .unwrap();
  assert!(
    !run(
      root.path(),
      &[
        "export",
        "docs/a.md",
        "--format",
        "html",
        "--output",
        "a.html"
      ]
    )
    .status
    .success()
  );
  symlink(
    root.path().join("secret.png"),
    root.path().join("docs/linked.md"),
  )
  .unwrap();
  fs::write(root.path().join("docs/a.md"), "Valid").unwrap();
  success(&run(
    root.path(),
    &[
      "export",
      "docs",
      "--format",
      "txt",
      "--output",
      "out",
      "--recursive",
    ],
  ));
  assert!(!root.path().join("out/linked.txt").exists());
}
