use super::{
  check_cancelled,
  docx::Context,
  markdown::{self, Kind, Node},
  typst_engine,
};
use crate::error::{BackendError, BackendResult};
use docx_rs::*;
use std::collections::BTreeMap;

#[derive(Clone, Copy, Default)]
pub(super) struct Style {
  pub(super) bold: bool,
  pub(super) italic: bool,
  pub(super) strike: bool,
  pub(super) code: bool,
}
pub(super) fn inlines(
  mut paragraph: Paragraph,
  nodes: &[Node],
  style: Style,
  context: &Context<'_>,
) -> BackendResult<Paragraph> {
  for node in nodes {
    check_cancelled(context.cancelled)?;
    match node {
      Node::Text(text) | Node::Code(text) => {
        for (index, line) in text.split('\n').enumerate() {
          if index > 0 {
            paragraph = paragraph.add_run(Run::new().add_break(BreakType::TextWrapping));
          }
          let mut run = Run::new().add_text(line);
          if style.bold {
            run = run.bold();
          }
          if style.italic {
            run = run.italic();
          }
          if style.strike {
            run = run.strike();
          }
          if style.code || matches!(node, Node::Code(_)) {
            run = run.fonts(RunFonts::new().ascii("Consolas").hi_ansi("Consolas"));
          }
          paragraph = paragraph.add_run(run);
        }
      }
      Node::Math(value, block) => {
        paragraph = paragraph.add_run(image_run(
          typst_engine::equation_png(value, *block)?,
          context.max_image_width_pt,
        ))
      }
      Node::Break(hard) => {
        paragraph = paragraph.add_run(if *hard {
          Run::new().add_break(BreakType::TextWrapping)
        } else {
          Run::new().add_text(" ")
        })
      }
      Node::Rule => {
        paragraph = paragraph.add_run(Run::new().add_text("────────────").color("94A3B8"))
      }
      Node::Task(done) => {
        paragraph = paragraph.add_run(Run::new().add_text(if *done { "☑ " } else { "☐ " }))
      }
      Node::FootnoteReference(label) => {
        let children = context.notes.get(label).ok_or_else(|| {
          BackendError::new("INVALID_DOCUMENT", format!("Missing footnote: {label}"))
        })?;
        let safe_context = Context {
          document: context.document,
          notes: BTreeMap::new(),
          cancelled: context.cancelled,
          max_image_width_pt: context.max_image_width_pt,
        };
        let note = Footnote::new().add_content(inlines(
          Paragraph::new(),
          children,
          Style::default(),
          &safe_context,
        )?);
        paragraph = paragraph.add_run(Run::new().add_footnote_reference(note));
      }
      Node::Element(Kind::Image(url), children) => {
        if let Some(bytes) = context.document.assets.get(url) {
          paragraph = paragraph.add_run(image_run(
            typst_engine::asset_png(bytes)?,
            context.max_image_width_pt,
          ));
        } else {
          paragraph = inlines(paragraph, children, style, context)?;
        }
      }
      Node::Element(Kind::Link(url), children) if markdown::safe_link(url) => {
        let linked = inlines(Paragraph::new(), children, style, context)?;
        let mut link = Hyperlink::new(url, HyperlinkType::External);
        for child in linked.children {
          if let ParagraphChild::Run(run) = child {
            link = link.add_run(*run);
          }
        }
        paragraph = paragraph.add_hyperlink(link);
      }
      Node::Element(kind, children) => {
        paragraph = inlines(
          paragraph,
          children,
          Style {
            bold: style.bold || matches!(kind, Kind::Strong),
            italic: style.italic || matches!(kind, Kind::Emphasis),
            strike: style.strike || matches!(kind, Kind::Strike),
            code: style.code,
          },
          context,
        )?
      }
    }
  }
  Ok(paragraph)
}

fn image_run(image: typst_engine::RasterImage, max_width_pt: f64) -> Run {
  // The rasterizer validated and encoded PNG bytes; unlike Pic::new, this
  // constructor does not decode with an infallible image API.
  let width = image.width.max(1);
  let height = image.height.max(1);
  // The Electron image width was 520 CSS pixels (390pt). Also honor the
  // actual text area, including narrow paper and wide publication margins.
  let display_width = (width as f64 / 2.0).min(390.0).min(max_width_pt);
  let display_height = display_width * height as f64 / width as f64;
  Run::new().add_image(Pic::new_with_dimensions(image.png, width, height).size(
    (display_width * 12700.0) as u32,
    (display_height * 12700.0) as u32,
  ))
}
