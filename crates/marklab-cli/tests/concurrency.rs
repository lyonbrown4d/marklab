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
fn bounded_parallel_export_matches_serial_files_and_document_links() {
  let root = tempfile::tempdir().unwrap();
  fs::create_dir_all(root.path().join("docs/nested")).unwrap();
  fs::write(
    root.path().join("docs/one.md"),
    "# One\n[Next](nested/two.md#details)",
  )
  .unwrap();
  fs::write(
    root.path().join("docs/nested/two.md"),
    "# Two\n## Details\n[Back](../one.md)",
  )
  .unwrap();
  fs::write(root.path().join("docs/three.md"), "# Three\n- item\n").unwrap();
  for (jobs, output) in [("1", "serial"), ("2", "parallel")] {
    let result = run(
      root.path(),
      &[
        "export",
        "docs",
        "--recursive",
        "--format",
        "html",
        "--output",
        output,
        "--jobs",
        jobs,
      ],
    );
    assert!(
      result.status.success(),
      "{}",
      String::from_utf8_lossy(&result.stderr)
    );
  }
  for relative in ["one.html", "nested/two.html", "three.html"] {
    assert_eq!(
      fs::read(root.path().join("serial").join(relative)).unwrap(),
      fs::read(root.path().join("parallel").join(relative)).unwrap()
    );
  }
}

#[test]
fn parallel_failures_are_aggregated_and_valid_files_are_committed() {
  let root = tempfile::tempdir().unwrap();
  fs::create_dir(root.path().join("docs")).unwrap();
  fs::write(root.path().join("docs/one.md"), [0xff]).unwrap();
  fs::write(root.path().join("docs/two.md"), [0xfe]).unwrap();
  fs::write(root.path().join("docs/valid.md"), "Valid").unwrap();
  let result = run(
    root.path(),
    &[
      "export", "docs", "--format", "txt", "--output", "out", "--jobs", "2",
    ],
  );
  assert!(!result.status.success());
  assert!(String::from_utf8_lossy(&result.stderr).contains("2 document(s) failed"));
  assert!(
    fs::read_to_string(root.path().join("out/valid.txt"))
      .unwrap()
      .contains("Valid")
  );
  assert!(!root.path().join("out/one.txt").exists());
  assert!(!root.path().join("out/two.txt").exists());
}

#[test]
fn invalid_jobs_and_parallel_output_conflicts_fail_before_writes() {
  let root = tempfile::tempdir().unwrap();
  fs::create_dir(root.path().join("docs")).unwrap();
  fs::write(root.path().join("docs/one.md"), "First").unwrap();
  let zero = run(
    root.path(),
    &[
      "export", "docs", "--format", "txt", "--output", "out", "--jobs", "0",
    ],
  );
  assert!(!zero.status.success());
  assert!(String::from_utf8_lossy(&zero.stderr).contains("greater than zero"));
  assert!(!root.path().join("out").exists());
  fs::write(root.path().join("docs/one.markdown"), "Collision").unwrap();
  let conflict = run(
    root.path(),
    &[
      "export", "docs", "--format", "txt", "--output", "out", "--jobs", "2",
    ],
  );
  assert!(!conflict.status.success());
  assert!(!root.path().join("out").exists());
}
