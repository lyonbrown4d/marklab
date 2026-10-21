use super::docx_inline::{Style, inlines};
use super::types::{PublicationOptions, SourceDocument};
use super::{
  check_cancelled,
  markdown::{self, Kind, Node},
};
use crate::error::{BackendError, BackendResult};
use docx_rs::*;
use std::collections::BTreeMap;
use std::io::Cursor;
use tokio_util::sync::CancellationToken;

pub fn render(
  documents: &[SourceDocument],
  options: &PublicationOptions,
  cancelled: &CancellationToken,
) -> BackendResult<Vec<u8>> {
  let (width, height) = options.dimensions_mm();
  let margin = twips(options.margin_mm() as f64) as i32;
  let mut docx = Docx::new()
    .default_size(22)
    .default_line_spacing(
      LineSpacing::new()
        .after(120)
        .line(276)
        .line_rule(LineSpacingType::Auto),
    )
    .page_size(twips(width), twips(height))
    .page_margin(
      PageMargin::new()
        .top(margin)
        .bottom(margin)
        .left(margin)
        .right(margin),
    );
  for (index, size) in [32, 26, 24, 22, 22, 22].into_iter().enumerate() {
    docx = docx.add_style(
      docx_rs::Style::new(format!("Heading{}", index + 1), StyleType::Paragraph)
        .name(format!("heading {}", index + 1))
        .based_on("Normal")
        .next("Normal")
        .size(size)
        .bold()
        .outline_lvl(index)
        .line_spacing(LineSpacing::new().before(240).after(120)),
    );
  }
  if options.orientation == "landscape" {
    docx = docx.page_orient(PageOrientationType::Landscape);
  }
  if options.page_numbers {
    docx = docx.footer(
      Footer::new().add_paragraph(
        Paragraph::new()
          .align(AlignmentType::Center)
          .add_page_num(PageNum::new()),
      ),
    );
  }
  if options.cover {
    docx = docx
      .add_paragraph(Paragraph::new().add_run(Run::new().add_text("MARKLAB").color("2563EB")))
      .add_paragraph(Paragraph::new().add_run(Run::new().add_text(&options.title).size(54).bold()))
      .add_paragraph(Paragraph::new().page_break_before(true));
  }
  if options.table_of_contents {
    let title = if options.locale == "zh-CN" {
      "目录"
    } else {
      "Contents"
    };
    docx = docx
      .add_paragraph(Paragraph::new().add_run(Run::new().add_text(title).size(36).bold()))
      .add_table_of_contents(
        TableOfContents::new()
          .heading_styles_range(1, 3)
          .hyperlink()
          .auto(),
      )
      .add_paragraph(Paragraph::new().page_break_before(true));
  }
  for (index, document) in documents.iter().enumerate() {
    check_cancelled(cancelled)?;
    let nodes = markdown::parse(&document.markdown)?;
    let context = Context {
      document,
      notes: markdown::footnotes(&nodes),
      cancelled,
      max_image_width_pt: ((width - 2.0 * options.margin_mm() as f64) / 25.4 * 72.0).max(1.0),
    };
    if index > 0 && options.page_breaks {
      docx = docx.add_paragraph(Paragraph::new().page_break_before(true));
    }
    if !nodes
      .iter()
      .any(|node| matches!(node, Node::Element(Kind::Heading(1), _)))
    {
      docx = docx.add_paragraph(heading(
        Paragraph::new().add_run(Run::new().add_text(&document.title)),
        1,
      ));
    }
    for block in blocks(&nodes, &context, 0)? {
      docx = match block {
        Block::Paragraph(p) => docx.add_paragraph(*p),
        Block::Table(t) => docx.add_table(*t),
      };
    }
  }
  check_cancelled(cancelled)?;
  let mut output = Cursor::new(Vec::new());
  docx
    .pack(&mut output)
    .map_err(|error| BackendError::new("EXPORT_RENDER_FAILED", error.to_string()))?;
  Ok(output.into_inner())
}

enum Block {
  Paragraph(Box<Paragraph>),
  Table(Box<Table>),
}
impl Block {
  fn paragraph(paragraph: Paragraph) -> Self {
    Self::Paragraph(Box::new(paragraph))
  }
}
pub(super) struct Context<'a> {
  pub(super) document: &'a SourceDocument,
  pub(super) notes: BTreeMap<String, Vec<Node>>,
  pub(super) cancelled: &'a CancellationToken,
  pub(super) max_image_width_pt: f64,
}
fn twips(mm: f64) -> u32 {
  (mm / 25.4 * 1440.0).round() as u32
}
fn heading(paragraph: Paragraph, level: u8) -> Paragraph {
  paragraph
    .style(&format!("Heading{level}"))
    .outline_lvl((level - 1) as usize)
    .keep_next(true)
}

fn blocks(nodes: &[Node], context: &Context<'_>, depth: u32) -> BackendResult<Vec<Block>> {
  if !nodes.is_empty() && nodes.iter().all(is_inline) {
    return Ok(vec![Block::paragraph(inlines(
      Paragraph::new(),
      nodes,
      Style::default(),
      context,
    )?)]);
  }
  let mut output = Vec::new();
  for node in nodes {
    check_cancelled(context.cancelled)?;
    match node {
      Node::Element(Kind::Footnote(_), _) => {}
      Node::Element(Kind::Table(_), rows) => {
        let rows = rows
          .iter()
          .filter_map(|row| match row {
            Node::Element(Kind::TableHead | Kind::TableRow, cells) => Some(cells),
            _ => None,
          })
          .map(|cells| {
            let cells = cells
              .iter()
              .map(|cell| {
                let Node::Element(_, content) = cell else {
                  return Ok(TableCell::new());
                };
                Ok(TableCell::new().add_paragraph(inlines(
                  Paragraph::new().line_spacing(LineSpacing::new().after(0)),
                  content,
                  Style::default(),
                  context,
                )?))
              })
              .collect::<BackendResult<Vec<_>>>()?;
            Ok(TableRow::new(cells))
          })
          .collect::<BackendResult<Vec<_>>>()?;
        output.push(Block::Table(Box::new(Table::new(rows))));
      }
      Node::Element(Kind::List(start), items) => {
        for (index, item) in items.iter().enumerate() {
          let Node::Element(Kind::Item, children) = item else {
            continue;
          };
          let prefix = start.map_or_else(
            || "• ".into(),
            |start| format!("{}. ", start + index as u64),
          );
          let mut parts = blocks(children, context, depth + 1)?;
          if parts.is_empty() {
            parts.push(Block::paragraph(inlines(
              Paragraph::new(),
              children,
              Style::default(),
              context,
            )?));
          }
          for (part_index, part) in parts.into_iter().enumerate() {
            match part {
              Block::Paragraph(paragraph) => {
                let mut paragraph = *paragraph;
                if part_index == 0 {
                  let mut prefixed = Paragraph::new().add_run(Run::new().add_text(&prefix));
                  prefixed.children.extend(paragraph.children);
                  prefixed.property = paragraph.property;
                  paragraph = prefixed;
                }
                output.push(Block::paragraph(paragraph.indent(
                  Some(((depth + 1) * 360) as i32),
                  None,
                  None,
                  None,
                )));
              }
              other => output.push(other),
            }
          }
        }
      }
      Node::Element(Kind::Quote, children) => {
        for block in blocks(children, context, depth)? {
          output.push(match block {
            Block::Paragraph(p) => {
              Block::paragraph((*p).indent(Some(360), None, None, None).color("475569"))
            }
            other => other,
          });
        }
      }
      Node::Element(kind, children) => {
        let mut paragraph = inlines(
          Paragraph::new(),
          children,
          Style {
            code: matches!(kind, Kind::CodeBlock(_)),
            ..Default::default()
          },
          context,
        )?;
        if let Kind::Heading(level) = kind {
          paragraph = heading(paragraph, *level);
        } else if matches!(kind, Kind::CodeBlock(_)) {
          paragraph = paragraph.line_spacing(LineSpacing::new().before(40).after(40));
        }
        output.push(Block::paragraph(paragraph));
      }
      _ => output.push(Block::paragraph(inlines(
        Paragraph::new(),
        std::slice::from_ref(node),
        Style::default(),
        context,
      )?)),
    }
  }
  Ok(output)
}

fn is_inline(node: &Node) -> bool {
  match node {
    Node::Element(kind, _) => matches!(
      kind,
      Kind::Strong | Kind::Emphasis | Kind::Strike | Kind::Link(_) | Kind::Image(_)
    ),
    Node::Rule => false,
    _ => true,
  }
}
