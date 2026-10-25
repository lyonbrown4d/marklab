use super::{
  Resource, escape,
  links::{self, ChapterLinks},
  xhtml,
};
use crate::{
  check_cancelled,
  error::BackendResult,
  markdown::{self, Kind, Node},
  types::{PublicationOptions, SourceDocument},
  typst_engine,
};
use std::collections::BTreeMap;
use tokio_util::sync::CancellationToken;

struct Chapter<'a> {
  document: &'a SourceDocument,
  index: usize,
  links: &'a [ChapterLinks],
  resources: &'a mut Vec<Resource>,
  cancelled: &'a CancellationToken,
  heading: usize,
  notes: BTreeMap<String, usize>,
  references: BTreeMap<String, usize>,
  images: BTreeMap<String, String>,
  header: bool,
}

pub(super) fn chapter(
  document: &SourceDocument,
  nodes: &[Node],
  index: usize,
  links: &[ChapterLinks],
  resources: &mut Vec<Resource>,
  options: &PublicationOptions,
  cancelled: &CancellationToken,
) -> BackendResult<String> {
  let mut chapter = Chapter {
    document,
    index,
    links,
    resources,
    cancelled,
    heading: 0,
    notes: markdown::footnotes(nodes)
      .keys()
      .enumerate()
      .map(|(index, label)| (label.clone(), index))
      .collect(),
    references: BTreeMap::new(),
    images: BTreeMap::new(),
    header: false,
  };
  let title = if nodes
    .iter()
    .any(|node| matches!(node, Node::Element(Kind::Heading(1), _)))
  {
    String::new()
  } else {
    format!("<h1>{}</h1>", escape(&document.title))
  };
  let body = format!(
    "<section class=\"chapter\" id=\"chapter-{index}\">{title}{}</section>",
    chapter.nodes(nodes)?
  );
  Ok(xhtml(&document.title, &options.locale, &body))
}

impl Chapter<'_> {
  fn nodes(&mut self, nodes: &[Node]) -> BackendResult<String> {
    let mut output = String::new();
    for node in nodes {
      check_cancelled(self.cancelled)?;
      match node {
        Node::Text(value) => output.push_str(&escape(value)),
        Node::Code(value) => output.push_str(&format!("<code>{}</code>", escape(value))),
        Node::Break(hard) => output.push_str(if *hard { "<br/>" } else { "\n" }),
        Node::Rule => output.push_str("<hr/>"),
        Node::Task(done) => output.push_str(if *done { "☑ " } else { "☐ " }),
        Node::Math(value, block) => {
          let raster = typst_engine::equation_png(value, *block)?;
          check_cancelled(self.cancelled)?;
          let name = self.add_image(raster.png);
          let image = format!(
            "<img class=\"math\" src=\"{name}\" alt=\"{}\" width=\"{}\" height=\"{}\"/>",
            escape(value),
            raster.width / 2,
            raster.height / 2
          );
          if *block {
            output.push_str(&format!("<span class=\"display-math\">{image}</span>"));
          } else {
            output.push_str(&image);
          }
        }
        Node::FootnoteReference(label) => {
          if let Some(note) = self.notes.get(label) {
            let count = self.references.entry(label.clone()).or_default();
            let reference = format!("ref-{}-{note}-{count}", self.index);
            *count += 1;
            output.push_str(&format!("<sup><a epub:type=\"noteref\" id=\"{reference}\" href=\"#fn-{}-{note}\">{}</a></sup>", self.index, escape(label)));
          } else {
            output.push_str(&format!("[{}]", escape(label)));
          }
        }
        Node::Element(kind, children) => output.push_str(&self.element(kind, children)?),
      }
    }
    Ok(output)
  }

  fn element(&mut self, kind: &Kind, children: &[Node]) -> BackendResult<String> {
    match kind {
      Kind::Image(url) => return self.image(url, children),
      Kind::CodeBlock(language) => {
        return Ok(format!(
          "<pre><code class=\"language-{}\">{}</code></pre>",
          escape(language),
          escape(&markdown::plain(children))
        ));
      }
      Kind::Heading(level) => {
        let id = self.links[self.index]
          .headings
          .get(self.heading)
          .cloned()
          .unwrap_or_else(|| format!("heading-{}", self.heading));
        self.heading += 1;
        return Ok(format!(
          "<h{level} id=\"{}\">{}</h{level}>",
          escape(&id),
          self.nodes(children)?
        ));
      }
      Kind::Table(_) => {
        let mut body = String::new();
        let mut rows = String::new();
        for child in children {
          if matches!(child, Node::Element(Kind::TableHead, _)) {
            body.push_str(&self.nodes(std::slice::from_ref(child))?);
          } else {
            rows.push_str(&self.nodes(std::slice::from_ref(child))?);
          }
        }
        return Ok(format!("<table>{body}<tbody>{rows}</tbody></table>"));
      }
      Kind::TableHead => {
        let previous = self.header;
        self.header = true;
        let body = self.nodes(children)?;
        self.header = previous;
        return Ok(format!("<thead><tr>{body}</tr></thead>"));
      }
      _ => (),
    }
    let body = self.nodes(children)?;
    Ok(match kind {
      Kind::Link(url) => links::href(url, self.index, self.links).map_or(body.clone(), |url| {
        format!("<a href=\"{}\">{body}</a>", escape(&url))
      }),
      Kind::List(Some(start)) => format!("<ol start=\"{start}\">{body}</ol>"),
      Kind::Footnote(label) => {
        if let Some(note) = self.notes.get(label) {
          // The definition can precede its reference, so link back only to known references.
          let backlink = if self.references.contains_key(label) {
            format!(
              "<a href=\"#ref-{}-{note}-0\" aria-label=\"Back to reference\">↩</a>",
              self.index
            )
          } else {
            String::new()
          };
          format!(
            "<aside epub:type=\"footnote\" id=\"fn-{}-{note}\">{body}{backlink}</aside>",
            self.index
          )
        } else {
          body
        }
      }
      _ => {
        let tag = match kind {
          Kind::Paragraph => "p",
          Kind::Quote => "blockquote",
          Kind::List(None) => "ul",
          Kind::Item => "li",
          Kind::TableRow => "tr",
          Kind::TableCell if self.header => "th",
          Kind::TableCell => "td",
          Kind::Strong => "strong",
          Kind::Emphasis => "em",
          Kind::Strike => "del",
          _ => "span",
        };
        format!("<{tag}>{body}</{tag}>")
      }
    })
  }

  fn image(&mut self, url: &str, children: &[Node]) -> BackendResult<String> {
    let alt = markdown::plain(children);
    let name = if let Some(name) = self.images.get(url) {
      Some(name.clone())
    } else if let Some(bytes) = self.document.assets.get(url) {
      let image = typst_engine::asset_png(bytes)?;
      check_cancelled(self.cancelled)?;
      let name = self.add_image(image.png);
      self.images.insert(url.into(), name.clone());
      Some(name)
    } else {
      None
    };
    Ok(if let Some(name) = name {
      format!("<img src=\"{name}\" alt=\"{}\"/>", escape(&alt))
    } else {
      let description = if alt.is_empty() { url } else { &alt };
      format!(
        "<span class=\"missing-image\">[Image unavailable: {}]</span>",
        escape(description)
      )
    })
  }

  fn add_image(&mut self, bytes: Vec<u8>) -> String {
    let name = format!("images/image-{}.png", self.resources.len());
    self.resources.push(Resource {
      name: name.clone(),
      bytes,
    });
    name
  }
}
