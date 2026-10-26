use super::*;
use typst::layout::{Frame, FrameItem};

fn frame_text(frame: &Frame, output: &mut String) {
  for (_, item) in frame.items() {
    match item {
      FrameItem::Text(text) => output.push_str(text.text.as_str()),
      FrameItem::Group(group) => frame_text(&group.frame, output),
      _ => {}
    }
  }
}

#[test]
fn wide_worksheet_tables_paginate_without_losing_chinese_or_last_rows() {
  let columns = 10;
  let rows = 80;
  let mut markdown = String::from(
    "| First | Second | Third | Four | Five | Six | Seven | Eight | Nine | Ten |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n",
  );
  for row in 0..rows {
    markdown.push('|');
    for column in 0..columns {
      markdown.push_str(&format!(" R{row:03}C{column}中文评分内容 |"));
    }
    markdown.push('\n');
  }
  let context = Context {
    images: BTreeMap::new(),
    notes: BTreeMap::new(),
  };
  let body = nodes_source(
    &markdown::parse(&markdown).expect("worksheet Markdown"),
    &context,
  )
  .expect("table source");
  let source = format!(
    "#set page(width: 210mm, height: 297mm, margin: 18mm)\n#set text(size: 11pt, font: (\"Noto Sans CJK SC\", \"PingFang SC\", \"Microsoft YaHei\", \"Libertinus Serif\"))\n{body}"
  );
  let document = compile(source, BTreeMap::new()).expect("wide worksheet compiles");
  assert!(document.pages().len() > 1, "long worksheets paginate");
  let mut visible = String::new();
  for page in document.pages() {
    frame_text(&page.frame, &mut visible);
  }
  assert!(visible.contains("中文评分内容"));
  for row in 0..rows {
    for column in 0..columns {
      assert!(
        visible.contains(&format!("R{row:03}C{column}")),
        "cell {row}:{column} was lost"
      );
    }
  }
  let pdf = typst_pdf::pdf(&document, &Default::default()).expect("PDF serialization");
  assert!(pdf.starts_with(b"%PDF-"));
}
