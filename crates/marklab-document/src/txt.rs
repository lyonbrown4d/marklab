use crate::{
  check_cancelled,
  error::BackendResult,
  markdown::{self, Kind, Node},
  types::{PublicationOptions, SourceDocument},
};
use tokio_util::sync::CancellationToken;

pub fn render(
  documents: &[SourceDocument],
  options: &PublicationOptions,
  cancelled: &CancellationToken,
) -> BackendResult<Vec<u8>> {
  check_cancelled(cancelled)?;
  let mut sections = Vec::new();
  if options.cover {
    sections.push(options.title.clone());
  }
  if options.table_of_contents {
    let label = if options.locale == "zh-CN" {
      "目录"
    } else {
      "Contents"
    };
    sections.push(format!(
      "{label}\n{}",
      documents
        .iter()
        .enumerate()
        .map(|(index, document)| format!("{}. {}", index + 1, document.title))
        .collect::<Vec<_>>()
        .join("\n")
    ));
  }
  for document in documents {
    check_cancelled(cancelled)?;
    let nodes = markdown::parse(&document.markdown)?;
    let mut body = String::new();
    if !nodes
      .iter()
      .any(|node| matches!(node, Node::Element(Kind::Heading(1), _)))
    {
      body.push_str(&document.title);
      body.push_str("\n\n");
    }
    body.push_str(&text(&nodes, 0, cancelled)?);
    sections.push(body.trim_end().to_owned());
  }
  Ok(format!("{}\n", sections.join("\n\n")).into_bytes())
}

fn text(nodes: &[Node], depth: usize, cancelled: &CancellationToken) -> BackendResult<String> {
  let mut output = String::new();
  for node in nodes {
    check_cancelled(cancelled)?;
    match node {
      Node::Text(value) | Node::Code(value) => output.push_str(value),
      Node::Math(value, block) => {
        if *block {
          output.push_str("\n\n");
        }
        output.push_str(value);
        if *block {
          output.push_str("\n\n");
        }
      }
      Node::Break(_) => output.push('\n'),
      Node::Rule => output.push_str("\n────────────────────\n\n"),
      Node::Task(done) => output.push_str(if *done { "☑ " } else { "☐ " }),
      Node::FootnoteReference(label) => output.push_str(&format!("[{label}]")),
      Node::Element(kind, children) => {
        if let Kind::List(start) = kind {
          for (index, item) in children.iter().enumerate() {
            let contents = match item {
              Node::Element(Kind::Item, children) => text(children, depth + 1, cancelled)?,
              _ => text(std::slice::from_ref(item), depth + 1, cancelled)?,
            };
            let marker = start.map_or_else(
              || "• ".to_owned(),
              |start| format!("{}. ", start.saturating_add(index as u64)),
            );
            output.push_str(&format!(
              "{}{marker}{}\n",
              "  ".repeat(depth),
              contents.trim_end()
            ));
          }
          output.push('\n');
          continue;
        }
        let body = text(children, depth, cancelled)?;
        match kind {
          Kind::Paragraph | Kind::Heading(_) | Kind::CodeBlock(_) | Kind::Quote => {
            output.push_str(body.trim_end());
            output.push_str("\n\n");
          }
          Kind::Link(url) if !url.is_empty() => {
            output.push_str(&body);
            if body != *url {
              output.push_str(&format!(" ({url})"));
            }
          }
          Kind::Image(url) => {
            let label = if body.trim().is_empty() {
              url.as_str()
            } else {
              body.trim()
            };
            output.push_str(&format!("[Image: {label}]"));
          }
          Kind::Footnote(label) => output.push_str(&format!("[{label}] {}\n\n", body.trim_end())),
          Kind::TableCell => {
            output.push_str(body.trim());
            output.push('\t');
          }
          Kind::TableHead | Kind::TableRow => {
            output.push_str(body.trim_end_matches('\t'));
            output.push('\n');
          }
          Kind::Table(_) => {
            output.push_str(&body);
            output.push('\n');
          }
          _ => output.push_str(&body),
        }
      }
    }
  }
  Ok(output)
}

#[cfg(test)]
#[path = "txt_tests.rs"]
mod tests;
