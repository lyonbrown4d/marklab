use regex::Regex;
use std::{borrow::Cow, sync::LazyLock};

const MAX_BYTES: usize = 56 * 1024;
const REDACTED: &str = "[REDACTED]";
const TRUNCATED: &str = "[Truncated]";

struct Patterns {
  pem: Regex,
  url: Regex,
  authorization: Regex,
  credential: Regex,
}

impl Patterns {
  fn compile() -> Result<Self, regex::Error> {
    Ok(Self {
      pem: Regex::new(
        r"(?is)-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----.*?(?:-----END(?: [A-Z0-9]+)* PRIVATE KEY-----|$)",
      )?,
      url: Regex::new(r#"(?i)\b[a-z][a-z0-9+.-]*://[^\s\x00-\x1f\x7f\"'<>]+"#)?,
      authorization: Regex::new(r#"(?i)\b(Bearer|Basic)\s+[^\s,;\"']+"#)?,
      credential: Regex::new(concat!(
        r#"(?ix)\b[a-z0-9_.-]*(?:"#,
        r#"api[-_.\ ]?key|access[-_.\ ]?key|client[-_.\ ]?key|private[-_.\ ]?key|"#,
        r#"authorization|passphrase|password|secret|token|cookie|credential"#,
        // A credential key may itself be inside a serialized Error or
        // renderer message. Nested JSON adds 1/3/7/... backslashes to
        // its closing quote; scan only the already bounded record.
        r#")[a-z0-9_.-]*(?:\\*[\"'])?\s*[:=]\s*"#,
      ))?,
    })
  }
}

static PATTERNS: LazyLock<Option<Patterns>> = LazyLock::new(|| Patterns::compile().ok());

/// Sanitizes a single already-formatted record, including renderer/error text.
pub(super) fn sanitize(text: &str) -> String {
  let Some(patterns) = PATTERNS.as_ref() else {
    return "[REDACTED: sanitizer unavailable]".into();
  };
  // Bound scanning before regex/URL work; incomplete secrets are still redacted.
  let (input, truncated) = prefix(text, MAX_BYTES);
  let pem = patterns.pem.replace_all(input, "[REDACTED_PEM]");
  let urls = patterns
    .url
    .replace_all(&pem, |captures: &regex::Captures<'_>| {
      redact_url(&captures[0])
    });
  let auth = patterns.authorization.replace_all(&urls, "$1 [REDACTED]");
  let mut sanitized = redact_credentials(&auth, &patterns.credential);
  if truncated {
    sanitized.push_str(TRUNCATED);
  }
  escape_record(&sanitized)
}

fn redact_url(raw: &str) -> String {
  let Ok(mut url) = url::Url::parse(raw) else {
    return "[REDACTED_URL]".into();
  };
  if (!url.username().is_empty() || url.password().is_some())
    && (url.set_username("REDACTED").is_err() || url.set_password(None).is_err())
  {
    return "[REDACTED_URL]".into();
  }
  if url.query().is_some() {
    url.set_query(Some("REDACTED"));
  }
  if url.fragment().is_some() {
    url.set_fragment(Some("REDACTED"));
  }
  url.into()
}

fn redact_credentials(text: &str, pattern: &Regex) -> String {
  let mut result = String::with_capacity(text.len());
  let mut cursor = 0;
  while let Some(found) = pattern.find_at(text, cursor) {
    result.push_str(&text[cursor..found.end()]);
    result.push_str(REDACTED);
    let value = &text[found.end()..];
    // An unquoted value can be Debug/JSON structure or a whitespace-bearing
    // secret. Do not guess its boundary and accidentally preserve a suffix.
    let Some(end) = quoted_end(value) else {
      return result;
    };
    cursor = found.end() + end;
  }
  result.push_str(&text[cursor..]);
  result
}

fn quoted_end(value: &str) -> Option<usize> {
  let quote = value.chars().next()?;
  if quote != '\'' && quote != '"' {
    return None;
  }
  let mut escaped = false;
  for (offset, character) in value.char_indices().skip(1) {
    if escaped {
      escaped = false;
    } else if character == '\\' {
      escaped = true;
    } else if character == quote {
      return Some(offset + character.len_utf8());
    }
  }
  None
}

fn prefix(text: &str, limit: usize) -> (&str, bool) {
  let mut end = text.len().min(limit);
  while !text.is_char_boundary(end) {
    end -= 1;
  }
  (&text[..end], end != text.len())
}

fn escape_record(text: &str) -> String {
  let mut output = String::with_capacity(text.len().min(MAX_BYTES));
  for character in text.chars() {
    let mut encoded = [0; 4];
    let escaped: Cow<'_, str> = match character {
      '\n' => Cow::Borrowed("\\n"),
      '\r' => Cow::Borrowed("\\r"),
      '\t' => Cow::Borrowed("\\t"),
      other
        if other.is_control()
          || matches!(other, '\u{2028}' | '\u{2029}' | '\u{200e}' | '\u{200f}'
                        | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}') =>
      {
        Cow::Owned(format!("\\u{{{:x}}}", u32::from(other)))
      }
      other => Cow::Borrowed(other.encode_utf8(&mut encoded)),
    };
    if output.len() + escaped.len() > MAX_BYTES {
      let (bounded, _) = prefix(&output, MAX_BYTES - TRUNCATED.len());
      output.truncate(bounded.len());
      output.push_str(TRUNCATED);
      break;
    }
    output.push_str(&escaped);
  }
  output
}

#[cfg(test)]
#[path = "log_redaction_tests.rs"]
mod tests;
