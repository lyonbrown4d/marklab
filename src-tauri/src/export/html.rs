use super::types::{PublicationOptions, SourceDocument};
use super::{
  check_cancelled,
  markdown::{self, Kind, Node},
  typst_engine,
};
use crate::error::BackendResult;
use base64::{Engine, engine::general_purpose::STANDARD};
use tokio_util::sync::CancellationToken;

pub fn escape(value: &str) -> String {
  value
    .replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
    .replace('"', "&quot;")
    .replace('\'', "&#39;")
}

pub fn render(
  documents: &[SourceDocument],
  options: &PublicationOptions,
  cancelled: &CancellationToken,
) -> BackendResult<Vec<u8>> {
  let mut body = String::new();
  if options.cover {
    body.push_str(&format!(
      "<header class=\"cover\"><p>MARKLAB</p><h1>{}</h1></header>",
      escape(&options.title)
    ));
  }
  if options.table_of_contents {
    let label = if options.locale == "zh-CN" {
      "目录"
    } else {
      "Contents"
    };
    body.push_str(&format!("<nav><h1>{label}</h1><ol>"));
    for (index, document) in documents.iter().enumerate() {
      body.push_str(&format!(
        "<li><a href=\"#chapter-{index}\">{}</a></li>",
        escape(&document.title)
      ));
    }
    body.push_str("</ol></nav>");
  }
  for (index, document) in documents.iter().enumerate() {
    check_cancelled(cancelled)?;
    let nodes = markdown::parse(&document.markdown)?;
    body.push_str(&format!(
      "<section id=\"chapter-{index}\" class=\"chapter\">"
    ));
    if !nodes
      .iter()
      .any(|node| matches!(node, Node::Element(Kind::Heading(1), _)))
    {
      body.push_str(&format!("<h1>{}</h1>", escape(&document.title)));
    }
    body.push_str(&nodes_html(&nodes, document, cancelled, index)?);
    body.push_str("</section>");
  }
  let (width, height) = options.dimensions_mm();
  let page_break = if options.page_breaks {
    "break-before:page"
  } else {
    ""
  };
  let html = format!(
    "<!doctype html><html lang=\"{}\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>{}</title><style>\
        @page{{size:{width}mm {height}mm;margin:{}mm}}\
        body{{max-width:820px;margin:36px auto;padding:0 24px;color:#111827;font:15px/1.7 system-ui,sans-serif}}\
        h1,h2,h3,h4,h5,h6{{line-height:1.24;break-after:avoid}}\
        a{{color:#1d4ed8}}img{{max-width:100%;height:auto}}\
        pre{{padding:14px;background:#f8fafc;white-space:pre-wrap;overflow-wrap:anywhere}}\
        code{{font-family:ui-monospace,monospace}}table{{width:100%;border-collapse:collapse}}\
        th,td{{border:1px solid #cbd5e1;padding:7px 9px;text-align:left}}\
        blockquote{{border-left:3px solid #94a3b8;padding:0 1em;color:#475569}}\
        .cover,nav{{break-after:page}}.cover{{padding:20vh 0}}.chapter+.chapter{{{page_break}}}\
        img.math{{display:inline-block;vertical-align:middle;max-height:6em}}.display-math{{text-align:center}}\
        </style></head><body>{body}</body></html>",
    escape(&options.locale),
    escape(&options.title),
    options.margin_mm()
  );
  Ok(html.into_bytes())
}

fn nodes_html(
  nodes: &[Node],
  document: &SourceDocument,
  cancelled: &CancellationToken,
  chapter: usize,
) -> BackendResult<String> {
  let mut html = String::new();
  for node in nodes {
    check_cancelled(cancelled)?;
    match node {
      Node::Text(value) => html.push_str(&escape(value)),
      Node::Code(value) => html.push_str(&format!("<code>{}</code>", escape(value))),
      Node::Math(value, block) => {
        let image = typst_engine::equation_png(value, *block)?;
        let image = format!(
          "<img class=\"math\" alt=\"{}\" src=\"data:image/png;base64,{}\" width=\"{}\" height=\"{}\">",
          escape(value),
          STANDARD.encode(image.png),
          image.width / 2,
          image.height / 2
        );
        html.push_str(&if *block {
          format!("<div class=\"display-math\">{image}</div>")
        } else {
          image
        });
      }
      Node::Break(hard) => html.push_str(if *hard { "<br>" } else { "\n" }),
      Node::Rule => html.push_str("<hr>"),
      Node::Task(done) => html.push_str(if *done { "☑ " } else { "☐ " }),
      Node::FootnoteReference(label) => html.push_str(&format!(
        "<sup><a href=\"#fn-{chapter}-{}\">{}</a></sup>",
        escape(label),
        escape(label)
      )),
      Node::Element(kind, children) => {
        let body = nodes_html(children, document, cancelled, chapter)?;
        match kind {
          Kind::Image(url) => {
            if let Some(bytes) = document.assets.get(url) {
              let image = typst_engine::asset_png(bytes)?;
              html.push_str(&format!(
                "<img alt=\"{}\" src=\"data:image/png;base64,{}\">",
                escape(&markdown::plain(children)),
                STANDARD.encode(image.png)
              ));
            } else {
              html.push_str(&body);
            }
          }
          Kind::Heading(level) => html.push_str(&format!("<h{level}>{body}</h{level}>")),
          Kind::CodeBlock(language) => html.push_str(&format!(
            "<pre><code class=\"language-{}\">{}</code></pre>",
            escape(language),
            escape(&markdown::plain(children))
          )),
          Kind::Link(url) if markdown::safe_link(url) => {
            html.push_str(&format!("<a href=\"{}\">{body}</a>", escape(url)))
          }
          Kind::Footnote(label) => html.push_str(&format!(
            "<aside id=\"fn-{chapter}-{}\"><sup>{}</sup>{body}</aside>",
            escape(label),
            escape(label)
          )),
          Kind::List(Some(start)) => html.push_str(&format!("<ol start=\"{start}\">{body}</ol>")),
          _ => {
            let tag = match kind {
              Kind::Paragraph => "p",
              Kind::Quote => "blockquote",
              Kind::List(None) => "ul",
              Kind::Item => "li",
              Kind::Table(_) => "table",
              Kind::TableHead => "thead",
              Kind::TableRow => "tr",
              Kind::TableCell => "td",
              Kind::Strong => "strong",
              Kind::Emphasis => "em",
              Kind::Strike => "del",
              _ => "span",
            };
            if matches!(kind, Kind::TableHead) {
              html.push_str(&format!("<thead><tr>{body}</tr></thead>"));
            } else {
              html.push_str(&format!("<{tag}>{body}</{tag}>"));
            }
          }
        }
      }
    }
  }
  Ok(html)
}
