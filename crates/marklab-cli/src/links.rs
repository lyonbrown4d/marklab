use percent_encoding::percent_decode_str;
use pulldown_cmark::{Event, LinkType, Parser, Tag};
use std::{
  collections::BTreeMap,
  path::{Path, PathBuf},
};

/// Change only parser-recognized links to selected documents; raw HTML remains untrusted.
pub fn rewrite(
  markdown: &str,
  source: &Path,
  targets: &BTreeMap<PathBuf, String>,
  relative_to: Option<&Path>,
) -> String {
  let Some(parent) = source.parent() else {
    return markdown.into();
  };
  let mut edits = Vec::new();
  for (event, range) in Parser::new(markdown).into_offset_iter() {
    let Event::Start(Tag::Link {
      dest_url,
      link_type,
      ..
    }) = event
    else {
      continue;
    };
    let (path, fragment) = dest_url
      .split_once('#')
      .map_or((dest_url.as_ref(), None), |(path, hash)| (path, Some(hash)));
    let path = path.split('?').next().unwrap_or("");
    let Ok(decoded) = percent_decode_str(path).decode_utf8() else {
      continue;
    };
    if decoded.is_empty()
      || decoded.contains([':', '\\'])
      || Path::new(decoded.as_ref()).is_absolute()
    {
      continue;
    }
    let Ok(canonical) = parent.join(decoded.as_ref()).canonicalize() else {
      continue;
    };
    let Some(target) = targets.get(&canonical) else {
      continue;
    };
    let mut target = target.clone();
    if let Some(parent) = relative_to {
      let Some(relative) = pathdiff::diff_paths(Path::new(&target), parent) else {
        continue;
      };
      target = encode(&relative.to_string_lossy().replace('\\', "/"));
    }
    if let Some(fragment) = fragment.filter(|fragment| !fragment.is_empty()) {
      let Ok(fragment) = percent_decode_str(fragment).decode_utf8() else {
        continue;
      };
      let slug = encode(&marklab_document::analysis::slug(&fragment));
      if target.starts_with('#') {
        target = if targets.len() > 1 {
          format!("{target}-heading-{slug}")
        } else {
          format!("#{slug}")
        };
      } else {
        target.push('#');
        target.push_str(&slug);
      }
    }
    let original = &markdown[range.clone()];
    let label = label_end(original);
    let position = if link_type == LinkType::Inline {
      label.and_then(|end| {
        let tail = original.get(end..)?.strip_prefix('(')?;
        let whitespace = tail.len() - tail.trim_start().len();
        let start = end + 1 + whitespace + usize::from(tail.trim_start().starts_with('<'));
        original
          .get(start..)?
          .starts_with(dest_url.as_ref())
          .then_some(start)
      })
    } else {
      None
    };
    if let Some(position) = position {
      edits.push((
        range.start + position..range.start + position + dest_url.len(),
        target,
      ));
    } else if let Some(label_end) = label {
      edits.push((range, format!("{}({target})", &original[..label_end])));
    }
  }
  let mut result = markdown.to_owned();
  for (range, replacement) in edits.into_iter().rev() {
    result.replace_range(range, &replacement);
  }
  result
}

fn label_end(value: &str) -> Option<usize> {
  let mut depth = 0;
  let mut escaped = false;
  for (index, character) in value.char_indices() {
    if escaped {
      escaped = false;
      continue;
    }
    match character {
      '\\' => escaped = true,
      '[' => depth += 1,
      ']' => {
        depth -= 1;
        if depth == 0 {
          return Some(index + 1);
        }
      }
      _ => {}
    }
  }
  None
}

pub fn encode(value: &str) -> String {
  let mut output = String::new();
  for byte in value.bytes() {
    if byte.is_ascii_alphanumeric() || b"/-._~".contains(&byte) {
      output.push(byte as char);
    } else {
      output.push_str(&format!("%{byte:02X}"));
    }
  }
  output
}
