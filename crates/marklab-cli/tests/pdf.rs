use std::{fs, path::Path, process::Command};

fn pdf(root: &Path, arguments: &[&str], outputs: &[&str]) {
  let result = Command::new(env!("CARGO_BIN_EXE_marklab"))
    .current_dir(root)
    .args(arguments)
    .output()
    .unwrap();
  assert!(
    result.status.success(),
    "{}",
    String::from_utf8_lossy(&result.stderr)
  );
  assert!(result.stdout.is_empty());
  for output in outputs {
    let bytes = fs::read(root.join(output)).unwrap();
    assert!(bytes.starts_with(b"%PDF-"), "{output}");
    assert!(bytes.windows(5).any(|part| part == b"%%EOF"), "{output}");
  }
}

#[test]
fn pdf_supports_single_file_parallel_directory_and_combined_publication() {
  let root = tempfile::tempdir().unwrap();
  fs::create_dir_all(root.path().join("chapters/nested")).unwrap();
  fs::write(root.path().join("chapters/first.md"), "# First\nPDF body\n").unwrap();
  fs::write(
    root.path().join("chapters/nested/second.md"),
    "# Second\nAnother chapter\n",
  )
  .unwrap();
  pdf(
    root.path(),
    &[
      "export",
      "chapters/first.md",
      "--format",
      "pdf",
      "--output",
      "single.pdf",
    ],
    &["single.pdf"],
  );
  pdf(
    root.path(),
    &[
      "export",
      "chapters",
      "--recursive",
      "--format",
      "pdf",
      "--output",
      "individual",
      "--jobs",
      "2",
    ],
    &["individual/first.pdf", "individual/nested/second.pdf"],
  );
  pdf(
    root.path(),
    &[
      "publish", "chapters", "--format", "pdf", "--output", "book.pdf",
    ],
    &["book.pdf"],
  );
}
