use std::{fs, process::Command};

#[test]
fn exports_embeds_and_opt_in_attachment_links_through_shared_rendering() {
  let root = tempfile::tempdir().unwrap();
  fs::write(
    root.path().join("table.csv"),
    "Name,Value\nImportEvidence,42\n",
  )
  .unwrap();
  fs::write(root.path().join("embed.md"), "Before ![](table.csv) after").unwrap();
  fs::write(
    root.path().join("linked.md"),
    "| File |\n| --- |\n| [Table](table.csv) |\n",
  )
  .unwrap();
  for (input, linked, output) in [
    ("embed.md", false, "embed.html"),
    ("linked.md", false, "linked.html"),
    ("linked.md", true, "expanded.html"),
  ] {
    let mut command = Command::new(env!("CARGO_BIN_EXE_marklab"));
    command
      .current_dir(root.path())
      .args(["export", input, "--format", "html", "--output", output]);
    if linked {
      command.arg("--include-linked-spreadsheets");
    }
    let result = command.output().unwrap();
    assert!(
      result.status.success(),
      "{}",
      String::from_utf8_lossy(&result.stderr)
    );
    let html = fs::read_to_string(root.path().join(output)).unwrap();
    assert_eq!(
      html.contains("ImportEvidence"),
      input == "embed.md" || linked
    );
    if linked {
      assert_eq!(html.matches("<table>").count(), 2);
    }
  }
}
