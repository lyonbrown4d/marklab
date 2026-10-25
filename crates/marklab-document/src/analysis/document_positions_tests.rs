use super::*;

fn original_position(text: &str, offset: usize) -> (usize, usize) {
  let prefix = &text[..offset];
  (
    prefix.bytes().filter(|byte| *byte == b'\n').count() + 1,
    prefix
      .rsplit('\n')
      .next()
      .unwrap_or("")
      .encode_utf16()
      .count()
      + 1,
  )
}

#[test]
fn coordinates_and_context_preserve_utf16_and_existing_line_ending_rules() {
  for text in [
    "",
    "one",
    "\n\n",
    "中😀e\u{301}\ttext\r\n next\rline\n",
    "last\r",
  ] {
    let positions = DocumentPositions::new(text);
    for offset in text
      .char_indices()
      .map(|(offset, _)| offset)
      .chain([text.len()])
    {
      let expected = original_position(text, offset);
      assert_eq!(positions.position(offset), expected, "{text:?} at {offset}");
      assert_eq!(
        positions.context(expected.0),
        text.lines().nth(expected.0 - 1).unwrap_or("").trim(),
      );
    }
    assert_eq!(positions.context(0), "");
    assert_eq!(positions.context(usize::MAX), "");
  }
}

#[test]
fn checkpoints_allow_non_monotonic_markdown_and_wiki_passes() {
  let text = "# 中😀 heading\r\n[link](target.md)\n".repeat(500);
  let positions = DocumentPositions::new(&text);
  let offsets: Vec<_> = text
    .char_indices()
    .map(|(offset, _)| offset)
    .step_by(137)
    .collect();
  for offset in offsets
    .iter()
    .rev()
    .chain(&offsets)
    .copied()
    .chain([text.len()])
  {
    let expected = original_position(&text, offset);
    assert_eq!(positions.position(offset), expected);
    assert_eq!(
      positions.context(expected.0),
      text.lines().nth(expected.0 - 1).unwrap_or("").trim()
    );
  }
}

#[test]
fn empty_line_heavy_documents_keep_a_small_lazy_parse_local_index() {
  let text = "\n".repeat(1024 * 1024);
  let positions = DocumentPositions::new(&text);
  assert!(positions.starts.get().is_none());
  assert_eq!(positions.position(text.len()), (1024 * 1024 + 1, 1));
  // Resource contract: a source with a million lines must not retain a million
  // line records. Checkpoints are separated by at least 4 KiB of source bytes.
  assert!(positions.starts().len() <= text.len() / CHECKPOINT_SPACING + 1);
  assert_eq!(positions.context(1024 * 1024 + 1), "");
  assert_eq!(positions.position(usize::MAX), (1024 * 1024 + 1, 1));
  let unicode = DocumentPositions::new("😀tail");
  assert_eq!(unicode.position(1), (1, 1));
  assert_eq!(unicode.position(4), (1, 3));
}

#[test]
fn indexed_parsing_preserves_destinations_context_and_order_in_a_link_heavy_document() {
  let mut source = String::from("# Start\r\n");
  let mut expected = Vec::new();
  for index in 0..2000 {
    let line = format!("  😀 [Label](target{index}.md) and [[Wiki{index}|标签]]  \r\n");
    for target in [format!("target{index}.md"), format!("Wiki{index}")] {
      let column = line.find(&target).expect("literal destination");
      expected.push((
        target,
        index + 2,
        line[..column].encode_utf16().count() + 1,
        line.trim().to_owned(),
        source.len() + column,
      ));
    }
    source.push_str(&line);
  }
  let parsed = crate::analysis::document::parse("index.md".into(), source.clone()).expect("parse");
  assert_eq!(parsed.links.len(), expected.len());
  for (link, (target, line, column, context, offset)) in parsed.links.iter().zip(expected) {
    assert_eq!(
      (
        &link.target,
        link.line,
        link.column,
        &link.context,
        link.offset
      ),
      (&target, line, column, &context, offset)
    );
    assert_eq!(&source[link.offset..link.end_offset], target);
    assert!(link.span_start < link.span_end);
  }
}
