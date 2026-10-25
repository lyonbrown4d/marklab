// The Markdown parser supplies the validated link span. Locate only its literal
// destination for safe edits; decoded/escaped/reference destinations are read-only.
pub(super) fn destination(raw: &str, target: &str, kind: &str, inline: bool) -> Option<usize> {
  let start = if kind == "wiki" {
    raw.find("[[")? + 2
  } else if inline {
    inline_destination(raw)?
  } else {
    return None;
  };
  let tail = &raw[start..];
  let trimmed = tail.trim_start();
  let start = start + tail.len() - trimmed.len();
  let (start, literal) = if kind == "wiki" {
    (
      start,
      trimmed.split("]]").next()?.split('|').next()?.trim_end(),
    )
  } else if let Some(angled) = trimmed.strip_prefix('<') {
    (start + 1, angled.split('>').next()?)
  } else {
    let mut depth = 0usize;
    let mut escaped = false;
    let mut end = trimmed.len();
    for (offset, character) in trimmed.char_indices() {
      if escaped {
        escaped = false;
        continue;
      }
      if character == '\\' {
        escaped = true;
        continue;
      }
      match character {
        '(' => depth += 1,
        ')' if depth > 0 => depth -= 1,
        ')' => {
          end = offset;
          break;
        }
        value if value.is_whitespace() => {
          end = offset;
          break;
        }
        _ => (),
      }
    }
    (start, &trimmed[..end])
  };
  (!target.is_empty() && literal == target).then_some(start)
}

fn inline_destination(raw: &str) -> Option<usize> {
  let mut cursor = if raw.starts_with("![") {
    2
  } else if raw.starts_with('[') {
    1
  } else {
    return None;
  };
  let bytes = raw.as_bytes();
  let mut depth = 1usize;
  while cursor < bytes.len() {
    match bytes[cursor] {
      b'\\' => cursor += 2,
      b'`' => cursor = code_end(raw, cursor)?,
      // HTML/autolinks inside a label can contain arbitrary bracket text.
      // Keep these ambiguous destinations read-only instead of guessing.
      b'<' => return None,
      b'[' => {
        depth += 1;
        cursor += 1;
      }
      b']' => {
        depth = depth.checked_sub(1)?;
        cursor += 1;
        if depth == 0 {
          return (bytes.get(cursor) == Some(&b'(')).then_some(cursor + 1);
        }
        // A nested image's destination/title is outside the outer label
        // bracket structure, even when it contains literal ]( text.
        if bytes.get(cursor) == Some(&b'(') {
          cursor = parentheses_end(raw, cursor)?;
        }
      }
      _ => cursor += 1,
    }
  }
  None
}
fn code_end(raw: &str, start: usize) -> Option<usize> {
  let width = raw.as_bytes()[start..]
    .iter()
    .take_while(|byte| **byte == b'`')
    .count();
  let mut cursor = start + width;
  while let Some(next) = raw[cursor..].find('`') {
    let next = cursor + next;
    let run = raw.as_bytes()[next..]
      .iter()
      .take_while(|byte| **byte == b'`')
      .count();
    cursor = next + run;
    if run == width {
      return Some(cursor);
    }
  }
  None
}
fn quoted_end(raw: &str, start: usize) -> Option<usize> {
  let bytes = raw.as_bytes();
  let quote = bytes[start];
  let mut cursor = start + 1;
  while cursor < bytes.len() {
    if bytes[cursor] == b'\\' {
      cursor += 2;
    } else if bytes[cursor] == quote {
      return Some(cursor + 1);
    } else {
      cursor += 1;
    }
  }
  None
}
fn parentheses_end(raw: &str, start: usize) -> Option<usize> {
  let mut depth = 1usize;
  let mut cursor = start + 1;
  let bytes = raw.as_bytes();
  while cursor < bytes.len() {
    match bytes[cursor] {
      b'\\' => cursor += 2,
      b'\'' | b'"'
        if bytes
          .get(cursor.wrapping_sub(1))
          .is_some_and(u8::is_ascii_whitespace) =>
      {
        cursor = quoted_end(raw, cursor)?
      }
      b'<' => return None,
      b'(' => {
        depth += 1;
        cursor += 1;
      }
      b')' => {
        depth = depth.checked_sub(1)?;
        cursor += 1;
        if depth == 0 {
          return Some(cursor);
        }
      }
      _ => cursor += 1,
    }
  }
  None
}

// Monaco and LSP columns are UTF-16 code units, not byte offsets.
pub fn position(text: &str, offset: usize) -> (usize, usize) {
  let before = &text[..offset.min(text.len())];
  let line = before.bytes().filter(|byte| *byte == b'\n').count() + 1;
  let column = before
    .rsplit('\n')
    .next()
    .unwrap_or("")
    .encode_utf16()
    .count()
    + 1;
  (line, column)
}

#[cfg(test)]
#[path = "link_positions_tests.rs"]
mod tests;
