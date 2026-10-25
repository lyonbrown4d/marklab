use std::{
  fs,
  path::Path,
  process::{Command, Output},
};

fn run(root: &Path, args: &[&str]) -> Output {
  Command::new(env!("CARGO_BIN_EXE_marklab"))
    .current_dir(root)
    .args(args)
    .output()
    .unwrap()
}

#[test]
fn rewrites_destinations_without_touching_titles_or_reference_labels() {
  let root = tempfile::tempdir().unwrap();
  fs::create_dir(root.path().join("docs")).unwrap();
  fs::write(
    root.path().join("docs/one.md"),
    "[Title](two.md \"two.md\")\n[two.md][ref]\n\n[ref]: two.md\n",
  )
  .unwrap();
  fs::write(root.path().join("docs/two.md"), "# Two").unwrap();
  let output = run(
    root.path(),
    &["export", "docs", "--format", "html", "--output", "out"],
  );
  assert!(
    output.status.success(),
    "{}",
    String::from_utf8_lossy(&output.stderr)
  );
  let html = fs::read_to_string(root.path().join("out/one.html")).unwrap();
  assert!(html.contains("href=\"two.html\">Title</a>"));
  assert!(html.contains("href=\"two.html\">two.md</a>"));
}

#[test]
fn ancestor_output_directory_does_not_exclude_sources() {
  let root = tempfile::tempdir().unwrap();
  fs::create_dir(root.path().join("docs")).unwrap();
  fs::write(root.path().join("docs/one.md"), "# One").unwrap();
  let output = run(
    root.path(),
    &["export", "docs", "--format", "html", "--output", "."],
  );
  assert!(
    output.status.success(),
    "{}",
    String::from_utf8_lossy(&output.stderr)
  );
  assert!(root.path().join("one.html").is_file());
}

#[test]
fn discovery_omits_git_and_dependency_trees() {
  let root = tempfile::tempdir().unwrap();
  for directory in [
    "docs/.git",
    "docs/node_modules",
    "docs/normal",
    "docs/.venv",
    "docs/build",
    "docs/dist",
    "docs/target",
  ] {
    fs::create_dir_all(root.path().join(directory)).unwrap();
  }
  fs::write(root.path().join("docs/.git/private.md"), "Private").unwrap();
  fs::write(
    root.path().join("docs/node_modules/dependency.md"),
    "Dependency",
  )
  .unwrap();
  fs::write(root.path().join("docs/normal/source.md"), "Source").unwrap();
  for directory in [".venv", "build", "dist", "target"] {
    fs::write(
      root
        .path()
        .join("docs")
        .join(directory)
        .join("generated.md"),
      "Generated",
    )
    .unwrap();
  }
  let output = run(
    root.path(),
    &[
      "export",
      "docs",
      "--recursive",
      "--format",
      "txt",
      "--output",
      "out",
    ],
  );
  assert!(
    output.status.success(),
    "{}",
    String::from_utf8_lossy(&output.stderr)
  );
  assert!(!root.path().join("out/.git").exists());
  assert!(!root.path().join("out/node_modules").exists());
  for directory in [".venv", "build", "dist", "target"] {
    assert!(!root.path().join("out").join(directory).exists());
  }
  assert!(root.path().join("out/normal/source.txt").is_file());
}

#[test]
fn html_heading_links_resolve_in_directory_and_merged_publications() {
  let root = tempfile::tempdir().unwrap();
  fs::create_dir(root.path().join("docs")).unwrap();
  fs::write(
    root.path().join("docs/one.md"),
    "# One\n[Details](two.md#%E8%AF%A6%E7%BB%86)",
  )
  .unwrap();
  fs::write(root.path().join("docs/two.md"), "# Two\n## 详细\nBody").unwrap();
  let directory = run(
    root.path(),
    &["export", "docs", "--format", "html", "--output", "out"],
  );
  assert!(
    directory.status.success(),
    "{}",
    String::from_utf8_lossy(&directory.stderr)
  );
  let one = fs::read_to_string(root.path().join("out/one.html")).unwrap();
  let two = fs::read_to_string(root.path().join("out/two.html")).unwrap();
  assert!(one.contains("href=\"two.html#%E8%AF%A6%E7%BB%86\""));
  assert!(two.contains("id=\"详细\""));
  let merged = run(
    root.path(),
    &[
      "publish",
      "docs",
      "--format",
      "html",
      "--output",
      "book.html",
    ],
  );
  assert!(
    merged.status.success(),
    "{}",
    String::from_utf8_lossy(&merged.stderr)
  );
  let book = fs::read_to_string(root.path().join("book.html")).unwrap();
  assert!(book.contains("href=\"#chapter-1-heading-详细\""));
  assert!(book.contains("id=\"chapter-1-heading-详细\""));
}
