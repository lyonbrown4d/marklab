use super::check_cancelled;
use super::markdown::{self, Kind, Node};
use super::types::{PublicationOptions, SourceDocument};
use super::typst_engine::{compile, math, quoted};
use crate::error::{BackendError, BackendResult};
use std::collections::BTreeMap;
use std::sync::atomic::AtomicBool;

pub fn render(
    documents: &[SourceDocument],
    options: &PublicationOptions,
    cancelled: &AtomicBool,
) -> BackendResult<Vec<u8>> {
    let (width, height) = options.dimensions_mm();
    let numbering = if options.page_numbers {
        "\"1\""
    } else {
        "none"
    };
    let mut source = format!(
        "#set document(title: {})\n#set page(width: {width}mm, height: {height}mm, margin: {}mm, numbering: {numbering})\n\
        #set text(size: 11pt, font: (\"Noto Sans CJK SC\", \"PingFang SC\", \"Microsoft YaHei\", \"Libertinus Serif\"))\n\
        #set par(justify: true, leading: 0.65em)\n#show link: set text(fill: rgb(\"1d4ed8\"))\n\
        #show raw.where(block: true): block.with(fill: rgb(\"f8fafc\"), inset: 10pt, radius: 3pt)\n",
        quoted(&options.title),
        options.margin_mm(),
    );
    if options.cover {
        source.push_str(&format!("#v(25%)\n#text(size: 11pt, fill: blue)[MARKLAB]\n#v(2em)\n#text(size: 30pt, weight: \"bold\")[{}]\n#pagebreak()\n", text(&options.title)));
    }
    if options.table_of_contents {
        let title = if options.locale == "zh-CN" {
            "目录"
        } else {
            "Contents"
        };
        source.push_str(&format!(
            "#outline(title: {}, depth: 3)\n#pagebreak()\n",
            quoted(title)
        ));
    }
    let mut assets = BTreeMap::new();
    for (index, document) in documents.iter().enumerate() {
        check_cancelled(cancelled)?;
        let nodes = markdown::parse(&document.markdown)?;
        if index > 0 && options.page_breaks {
            source.push_str("#pagebreak()\n");
        }
        if !nodes
            .iter()
            .any(|node| matches!(node, Node::Element(Kind::Heading(1), _)))
        {
            source.push_str(&format!("#heading(level: 1)[{}]\n", text(&document.title)));
        }
        let mut image_names = BTreeMap::new();
        for (number, (url, bytes)) in document.assets.iter().enumerate() {
            let name = format!("chapter-{index}-asset-{number}");
            image_names.insert(url.clone(), name.clone());
            assets.insert(name, bytes.clone());
        }
        let context = Context {
            images: image_names,
            notes: markdown::footnotes(&nodes),
        };
        source.push_str(&nodes_source(&nodes, &context)?);
        source.push('\n');
    }
    check_cancelled(cancelled)?;
    let document = compile(source, assets)?;
    check_cancelled(cancelled)?;
    typst_pdf::pdf(&document, &Default::default())
        .map_err(|error| BackendError::new("EXPORT_RENDER_FAILED", format!("PDF: {error:?}")))
}

struct Context {
    images: BTreeMap<String, String>,
    notes: BTreeMap<String, Vec<Node>>,
}
fn text(value: &str) -> String {
    format!("#text({})", quoted(value))
}

fn nodes_source(nodes: &[Node], context: &Context) -> BackendResult<String> {
    nodes
        .iter()
        .map(|node| node_source(node, context))
        .collect()
}

fn node_source(node: &Node, context: &Context) -> BackendResult<String> {
    Ok(match node {
        Node::Text(value) => text(value),
        Node::Code(value) => format!("#raw({})", quoted(value)),
        Node::Math(value, block) => format!("#math.equation(block: {block})[${}$]", math(value)?),
        Node::Break(hard) => {
            if *hard {
                "#linebreak()".into()
            } else {
                " ".into()
            }
        }
        Node::Rule => "\n#line(length: 100%, stroke: 0.5pt + gray)\n".into(),
        Node::Task(done) => text(if *done { "☑ " } else { "☐ " }),
        Node::FootnoteReference(label) => {
            let note = context.notes.get(label).ok_or_else(|| {
                BackendError::new("INVALID_DOCUMENT", format!("Missing footnote: {label}"))
            })?;
            // Footnotes cannot contain further references to themselves.
            let safe_context = Context {
                images: context.images.clone(),
                notes: BTreeMap::new(),
            };
            format!("#footnote[{}]", nodes_source(note, &safe_context)?)
        }
        Node::Element(kind, children) => {
            if matches!(kind, Kind::Footnote(_)) {
                return Ok(String::new());
            }
            if let Kind::Image(url) = kind {
                return Ok(match context.images.get(url) {
                    Some(name) => format!("#image({}, width: 90%)", quoted(name)),
                    None => text(&markdown::plain(children)),
                });
            }
            let body = nodes_source(children, context)?;
            match kind {
                Kind::Paragraph => format!("{body}\n\n"),
                Kind::Heading(level) => format!("\n#heading(level: {level})[{body}]\n"),
                Kind::Quote => format!("\n#quote(block: true)[{body}]\n"),
                Kind::CodeBlock(language) => format!(
                    "\n#raw({}, block: true, lang: {})\n",
                    quoted(&markdown::plain(children)),
                    quoted(language)
                ),
                Kind::List(start) => {
                    let items = children
                        .iter()
                        .map(|node| {
                            let Node::Element(Kind::Item, parts) = node else {
                                return Ok(String::new());
                            };
                            Ok(format!("[{}],", nodes_source(parts, context)?))
                        })
                        .collect::<BackendResult<String>>()?;
                    match start {
                        Some(start) => format!("\n#enum(start: {start}, {items})\n"),
                        None => format!("\n#list({items})\n"),
                    }
                }
                Kind::Table(columns) => format!(
                    "\n#table(columns: {columns}, stroke: 0.5pt + rgb(\"cbd5e1\"), inset: 6pt, {body})\n"
                ),
                Kind::TableHead => format!("table.header({body}),"),
                Kind::TableCell => format!("[{body}],"),
                Kind::Strong => format!("#strong[{body}]"),
                Kind::Emphasis => format!("#emph[{body}]"),
                Kind::Strike => format!("#strike[{body}]"),
                Kind::Link(url) if markdown::safe_link(url) => {
                    format!("#link({})[{body}]", quoted(url))
                }
                _ => body,
            }
        }
    })
}
