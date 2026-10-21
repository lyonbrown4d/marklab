use super::super::protocol::position;
use lsp_types::{Diagnostic, DiagnosticSeverity, Range as LspRange};
use pulldown_cmark::{BrokenLink, Event, LinkType, Options, Parser, Tag};
use std::{
  cell::RefCell,
  collections::{BTreeMap, HashSet},
  ops::Range,
};

struct Definition {
  label: String,
  span: Range<usize>,
  first: usize,
}

fn options() -> Options {
  Options::ENABLE_TABLES
    | Options::ENABLE_TASKLISTS
    | Options::ENABLE_FOOTNOTES
    | Options::ENABLE_STRIKETHROUGH
    | Options::ENABLE_WIKILINKS
}

pub(super) fn compute(text: &str) -> Vec<Diagnostic> {
  let lines: Vec<_> = std::iter::once(0)
    .chain(text.match_indices('\n').map(|(offset, _)| offset + 1))
    .collect();
  let missing = RefCell::new(Vec::new());
  let callback = |link: BrokenLink<'_>| {
    missing.borrow_mut().push(diagnostic(
      text,
      &lines,
      label_range(text, link.span, link.link_type),
      format!("No link definition found: '{}'", link.reference),
    ));
    // Resolve syntactically so a full missing reference does not also fall
    // back to a second missing shortcut reference for its display text.
    Some(("marklab-reference:missing".into(), "".into()))
  };
  let mut parser =
    Parser::new_with_broken_link_callback(text, options(), Some(callback)).into_offset_iter();
  let mut used_labels = HashSet::new();
  let mut excluded = Vec::new();
  for (event, span) in parser.by_ref() {
    match event {
      Event::Start(Tag::Link { link_type, id, .. } | Tag::Image { link_type, id, .. }) => {
        if matches!(
          link_type,
          LinkType::Reference | LinkType::Collapsed | LinkType::Shortcut
        ) {
          used_labels.insert(id.into_string());
        }
        excluded.push(span);
      }
      Event::Start(Tag::CodeBlock(_) | Tag::HtmlBlock)
      | Event::Code(_)
      | Event::Html(_)
      | Event::InlineHtml(_) => excluded.push(span),
      _ => (),
    }
  }
  let definitions = parser.reference_definitions();
  let used: HashSet<_> = used_labels
    .iter()
    .filter_map(|label| definitions.get(label))
    .map(|definition| definition.span.start)
    .collect();
  // The public parser map retains the first definition of each label. Inspect
  // source candidates with the same parser to recover duplicate declarations;
  // code/HTML/link spans above remain excluded from this second pass.
  excluded.sort_by_key(|span| span.start);
  let mut declarations = BTreeMap::new();
  for (label, definition) in definitions.iter() {
    declarations.insert(
      definition.span.start,
      Definition {
        label: label.into(),
        span: definition.span.clone(),
        first: definition.span.start,
      },
    );
  }
  let mut excluded_index = 0;
  for (start, _) in text.match_indices('[') {
    while excluded
      .get(excluded_index)
      .is_some_and(|span| span.end <= start)
    {
      excluded_index += 1;
    }
    if declarations.contains_key(&start)
      || excluded
        .get(excluded_index)
        .is_some_and(|span| span.contains(&start))
      || !definition_prefix(text, start, &lines)
    {
      continue;
    }
    let candidate = Parser::new_ext(definition_window(&text[start..]), options());
    for (label, definition) in candidate.reference_definitions().iter() {
      if definition.span.start != 0 {
        continue;
      }
      let Some(first) = definitions.get(label) else {
        continue;
      };
      declarations.insert(
        start,
        Definition {
          label: label.into(),
          span: start..start + definition.span.end,
          first: first.span.start,
        },
      );
    }
  }
  let mut groups = BTreeMap::<usize, usize>::new();
  for declaration in declarations.values() {
    *groups.entry(declaration.first).or_default() += 1;
  }
  drop(parser);
  let mut output = missing.into_inner();
  for declaration in declarations.into_values() {
    if !used.contains(&declaration.first) {
      output.push(diagnostic(
        text,
        &lines,
        declaration.span.clone(),
        "Link definition is unused".into(),
      ));
    }
    if groups[&declaration.first] > 1 {
      output.push(diagnostic(
        text,
        &lines,
        label_range(text, declaration.span, LinkType::Shortcut),
        format!("Link definition for '{}' already exists", declaration.label),
      ));
    }
  }
  output
}

fn definition_prefix(text: &str, start: usize, lines: &[usize]) -> bool {
  let line_start = lines[lines.partition_point(|offset| *offset <= start) - 1];
  // Container punctuation is retained in the source ranges of list/quote
  // definitions; validity of the following declaration belongs to the parser.
  text[line_start..start]
    .chars()
    .all(|c| c.is_ascii_whitespace() || matches!(c, '>' | '-' | '+' | '*' | '0'..='9' | '.' | ')'))
}

fn definition_window(text: &str) -> &str {
  // CommonMark labels have at most 999 characters. Include complete lines
  // after that prefix so a destination placed on the next line is available,
  // without reparsing the entire remaining document for every declaration.
  let label_end = text
    .char_indices()
    .nth(1001)
    .map_or(text.len(), |(offset, _)| offset);
  let line_end = text[label_end..]
    .find('\n')
    .map_or(text.len(), |n| label_end + n + 1);
  let end = text[line_end..]
    .find('\n')
    .map_or(text.len(), |n| line_end + n + 1);
  &text[..end]
}

fn label_range(text: &str, span: Range<usize>, kind: LinkType) -> Range<usize> {
  let raw = &text[span.clone()];
  let open = if matches!(kind, LinkType::Reference | LinkType::ReferenceUnknown) {
    raw.rfind('[')
  } else {
    raw.find('[')
  };
  let start = span.start + open.map_or(0, |offset| offset + 1);
  let end = text[start..span.end]
    .find(']')
    .map_or(span.end, |offset| start + offset);
  start..end
}

fn diagnostic(text: &str, lines: &[usize], span: Range<usize>, message: String) -> Diagnostic {
  let end = span.start + text[span.clone()].trim_end_matches(['\r', '\n']).len();
  let coordinate = |offset| {
    let line = lines.partition_point(|start| *start <= offset) - 1;
    position(line, text[lines[line]..offset].encode_utf16().count())
  };
  Diagnostic {
    message,
    range: LspRange::new(coordinate(span.start), coordinate(end.max(span.start))),
    severity: Some(DiagnosticSeverity::WARNING),
    source: Some("markdown".into()),
    ..Diagnostic::default()
  }
}
