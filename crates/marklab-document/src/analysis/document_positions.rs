use memchr::{memchr, memchr_iter};
use std::cell::OnceCell;

const CHECKPOINT_SPACING: usize = 4096;
struct LineStart {
  offset: usize,
  line: usize,
}

// Parse-local sparse checkpoints avoid both repeated full-prefix scans and a
// large per-line/per-character table for documents with millions of empty lines.
pub(super) struct DocumentPositions<'a> {
  pub text: &'a str,
  starts: OnceCell<Vec<LineStart>>,
}

impl<'a> DocumentPositions<'a> {
  pub fn new(text: &'a str) -> Self {
    Self {
      text,
      starts: OnceCell::new(),
    }
  }

  pub fn position(&self, offset: usize) -> (usize, usize) {
    let offset = self.text.floor_char_boundary(offset.min(self.text.len()));
    let starts = self.starts();
    let checkpoint = &starts[starts.partition_point(|start| start.offset <= offset) - 1];
    let mut line = checkpoint.line;
    let mut line_start = checkpoint.offset;
    for newline in memchr_iter(b'\n', &self.text.as_bytes()[checkpoint.offset..offset]) {
      line += 1;
      line_start = checkpoint.offset + newline + 1;
    }
    let column = self.text[line_start..offset].encode_utf16().count() + 1;
    (line + 1, column)
  }

  pub fn context(&self, line: usize) -> &str {
    let Some(line) = line.checked_sub(1) else {
      return "";
    };
    let starts = self.starts();
    let checkpoint = &starts[starts.partition_point(|start| start.line <= line) - 1];
    let mut start = checkpoint.offset;
    if line > checkpoint.line {
      let Some(newline) =
        memchr_iter(b'\n', &self.text.as_bytes()[start..]).nth(line - checkpoint.line - 1)
      else {
        return "";
      };
      start += newline + 1;
    }
    let rest = &self.text[start..];
    let end = memchr(b'\n', rest.as_bytes()).unwrap_or(rest.len());
    rest[..end].trim()
  }

  fn starts(&self) -> &[LineStart] {
    self.starts.get_or_init(|| {
      let mut starts = vec![LineStart { offset: 0, line: 0 }];
      let mut previous = 0;
      for (line, newline) in memchr_iter(b'\n', self.text.as_bytes()).enumerate() {
        let offset = newline + 1;
        if offset - previous >= CHECKPOINT_SPACING {
          starts.push(LineStart {
            offset,
            line: line + 1,
          });
          previous = offset;
        }
      }
      starts
    })
  }
}

#[cfg(test)]
#[path = "document_positions_tests.rs"]
mod tests;
