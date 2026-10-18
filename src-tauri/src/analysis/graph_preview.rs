use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd, html};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

const MAX_INPUT_CHARS: usize = 420;
const MAX_HTML_BYTES: usize = 32_768;
const MAX_MATH_ITEMS: usize = 64;

#[derive(Serialize)]
pub struct Preview {
    html: String,
    math: Vec<Math>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Math {
    id: String,
    expression: String,
    display_mode: bool,
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

// This renderer only sees the same bounded summary sent as `content`, even in full mode.
// Its result is retained by the existing revision-keyed analysis query cache.
pub fn render(markdown: &str) -> Preview {
    let input: String = markdown.chars().take(MAX_INPUT_CHARS).collect();
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_MATH;
    let mut math = Vec::new();
    let mut events = Vec::new();
    let mut image: Option<(String, String, String)> = None;
    for event in Parser::new_ext(&input, options) {
        let display_mode = matches!(&event, Event::DisplayMath(_));
        if let Some((alt, title, destination)) = image.as_mut() {
            match event {
                Event::End(TagEnd::Image) => {
                    let label = if !alt.trim().is_empty() {
                        alt.trim()
                    } else if !title.trim().is_empty() {
                        title.trim()
                    } else {
                        destination
                    };
                    events.push(Event::Html(
                        format!(
                            "<span class=\"graph-preview-image\">{}</span>",
                            escape(label)
                        )
                        .into(),
                    ));
                    image = None;
                }
                Event::Text(text)
                | Event::Code(text)
                | Event::Html(text)
                | Event::InlineHtml(text)
                | Event::InlineMath(text)
                | Event::DisplayMath(text) => alt.push_str(&text),
                Event::SoftBreak | Event::HardBreak => alt.push(' '),
                _ => {}
            }
            continue;
        }
        match event {
            Event::Start(Tag::Image {
                dest_url, title, ..
            }) => {
                image = Some((String::new(), title.to_string(), dest_url.to_string()));
            }
            Event::Start(Tag::Link { .. }) => {
                events.push(Event::Html("<span class=\"graph-preview-link\">".into()))
            }
            Event::End(TagEnd::Link) => events.push(Event::Html("</span>".into())),
            Event::FootnoteReference(label) => events.push(Event::Html(
                format!("<sup>[{}]</sup>", escape(&label)).into(),
            )),
            Event::Start(Tag::FootnoteDefinition(label)) => events.push(Event::Html(
                format!(
                    "<aside role=\"doc-footnote\" aria-label=\"[^{}]\"><span>[{}]</span>",
                    escape(&label),
                    escape(&label)
                )
                .into(),
            )),
            Event::End(TagEnd::FootnoteDefinition) => {
                events.push(Event::Html("</aside>".into()));
            }
            Event::InlineMath(expression) | Event::DisplayMath(expression) => {
                if math.len() >= MAX_MATH_ITEMS {
                    events.push(Event::Text(expression));
                    continue;
                }
                let id = format!("graph-math-{}", math.len());
                events.push(Event::Html(
                    format!(
                        "<span data-graph-math-id=\"{id}\" class=\"{}\">{}</span>",
                        if display_mode {
                            "graph-preview-display-math"
                        } else {
                            "graph-preview-inline-math"
                        },
                        escape(&expression)
                    )
                    .into(),
                ));
                math.push(Math {
                    id,
                    expression: expression.to_string(),
                    display_mode,
                });
            }
            Event::TaskListMarker(checked) => {
                events.push(Event::Text(if checked { "☑ " } else { "☐ " }.into()));
            }
            event => events.push(event),
        }
    }
    let mut rendered = String::new();
    html::push_html(&mut rendered, events.into_iter());
    // No URLs, images, styles, handlers, or arbitrary attributes cross the native boundary.
    // Keep only document structure and the inert formula slots populated by trusted KaTeX.
    let tags: HashSet<_> = [
        "p",
        "blockquote",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "br",
        "strong",
        "em",
        "s",
        "del",
        "code",
        "pre",
        "ul",
        "ol",
        "li",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "details",
        "summary",
        "kbd",
        "span",
        "sup",
        "aside",
        "div",
    ]
    .into_iter()
    .collect();
    let attributes: HashMap<_, HashSet<_>> = [
        ("span", ["data-graph-math-id"].into_iter().collect()),
        ("aside", ["role", "aria-label"].into_iter().collect()),
        ("ol", ["start"].into_iter().collect()),
    ]
    .into_iter()
    .collect();
    let sanitized = ammonia::Builder::default()
        .tags(tags)
        .tag_attributes(attributes)
        .allowed_classes(
            [(
                "span",
                [
                    "graph-preview-image",
                    "graph-preview-link",
                    "graph-preview-display-math",
                    "graph-preview-inline-math",
                ]
                .into_iter()
                .collect(),
            )]
            .into_iter()
            .collect(),
        )
        .generic_attributes(HashSet::new())
        .url_schemes(HashSet::new())
        .link_rel(None)
        .clean(&rendered)
        .to_string();
    if sanitized.len() > MAX_HTML_BYTES {
        return Preview {
            html: escape(&input),
            math: Vec::new(),
        };
    }
    Preview {
        html: sanitized,
        math,
    }
}

#[cfg(test)]
#[path = "graph_preview_tests.rs"]
mod tests;
