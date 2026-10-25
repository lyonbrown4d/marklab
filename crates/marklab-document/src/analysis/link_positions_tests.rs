use super::*;

#[test]
fn writable_destinations_do_not_select_identical_text_inside_labels_or_titles() {
  for source in [
    r#"[Go](target.md#old "note ](target.md#old)")"#,
    r#"[![cover](image.png "note ](target.md#old)")](target.md#old "title")"#,
    r#"[`](target.md#old)`](target.md#old "title")"#,
    r#"[escaped \] label](target.md#old "note ](target.md#old)")"#,
  ] {
    let document =
      crate::analysis::document::parse("a.md".into(), source.into()).expect("Markdown");
    let link = document
      .links
      .iter()
      .find(|link| link.target == "target.md#old")
      .expect("outer link");
    assert!(
      link.offset < link.end_offset,
      "a literal destination must stay writable: {source}"
    );
    let mut rewritten = source.to_owned();
    rewritten.replace_range(link.offset..link.end_offset, "renamed.md#new");
    assert!(
      rewritten.contains("](target.md#old)"),
      "matching label/title text must survive: {source}"
    );
    assert_eq!(&rewritten[..link.offset], &source[..link.offset]);
    assert_eq!(
      &rewritten[link.offset + "renamed.md#new".len()..],
      &source[link.end_offset..]
    );
    let parsed =
      crate::analysis::document::parse("a.md".into(), rewritten).expect("rewritten Markdown");
    assert!(
      parsed
        .links
        .iter()
        .any(|link| link.target == "renamed.md#new")
    );
  }
}

#[test]
fn ambiguous_or_decoded_destinations_stay_read_only() {
  assert!(
    destination(
      r#"[<!-- > ](target.md) --> Go](target.md)"#,
      "target.md",
      "markdown",
      true
    )
    .is_none()
  );
  assert!(destination("[unclosed `code](target.md)", "target.md", "markdown", true).is_none());
  assert!(
    destination(
      r#"[Go](target&#46;md "target.md")"#,
      "target.md",
      "markdown",
      true
    )
    .is_none()
  );
  assert!(destination("[Go][target.md]", "target.md", "markdown", false).is_none());
}
