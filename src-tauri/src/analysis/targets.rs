use super::document::{Document, Link, slug};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

pub fn resolve_documents(
  documents: &mut BTreeMap<String, Arc<Document>>,
  paths: &BTreeSet<String>,
) {
  let known: Vec<_> = documents.keys().cloned().collect();
  for document in documents.values_mut() {
    let file = Arc::make_mut(document);
    for link in file.links.iter_mut().chain(file.assets.iter_mut()) {
      resolve(link, &known, paths);
    }
  }
}

pub fn resolve(link: &mut Link, documents: &[String], paths: &BTreeSet<String>) {
  link.is_external = link.target.starts_with("//") || url::Url::parse(&link.target).is_ok();
  if link.is_external {
    return;
  }
  let (path, anchor) = link
    .target
    .split_once('#')
    .map_or((link.target.as_str(), None), |(path, anchor)| {
      (path, Some(anchor))
    });
  link.target_anchor = anchor.map(decode);
  link.target_heading_slug = anchor.map(|value| slug(&decode(value)));
  let path = decode(path.split('?').next().unwrap_or(""));
  let relative = normalize(&link.source_path, &path);
  let target = if path.is_empty() {
    Some(link.source_path.clone())
  } else if link.link_type == "wiki" {
    relative
      .as_ref()
      .filter(|path| paths.contains(*path))
      .cloned()
      .or_else(|| {
        relative.as_ref().and_then(|path| {
          [format!("{path}.md"), format!("{path}.markdown")]
            .into_iter()
            .find(|path| paths.contains(path))
        })
      })
      .or_else(|| {
        documents
          .iter()
          .find(|document| {
            let label = std::path::Path::new(document)
              .file_stem()
              .map(|value| value.to_string_lossy())
              .unwrap_or_default();
            label.eq_ignore_ascii_case(&path)
          })
          .cloned()
      })
      .or_else(|| {
        relative.map(|path| {
          if std::path::Path::new(&path).extension().is_some() {
            path
          } else {
            format!("{path}.md")
          }
        })
      })
  } else {
    relative.and_then(|relative| {
      if paths.contains(&relative) {
        return Some(relative);
      }
      [format!("{relative}.md"), format!("{relative}.markdown")]
        .into_iter()
        .find(|candidate| documents.contains(candidate))
        .or(Some(relative))
    })
  };
  link.target_path = target;
}

pub fn normalize(source: &str, target: &str) -> Option<String> {
  if target.contains('\0') || target.contains(':') {
    return None;
  }
  let portable = target.replace('\\', "/");
  let base = if portable.starts_with('/') {
    ""
  } else {
    source.rsplit_once('/').map_or("", |(parent, _)| parent)
  };
  let mut parts: Vec<_> = base.split('/').filter(|part| !part.is_empty()).collect();
  for part in portable.split('/') {
    match part {
      "" | "." => {}
      ".." => {
        parts.pop()?;
      }
      value => parts.push(value),
    }
  }
  (!parts.is_empty()).then(|| parts.join("/"))
}

pub fn decode(value: &str) -> String {
  let mut output = Vec::new();
  let bytes = value.as_bytes();
  let mut index = 0;
  while index < bytes.len() {
    if bytes[index] == b'%' && index + 2 < bytes.len() {
      let digits = (bytes[index + 1] as char)
        .to_digit(16)
        .zip((bytes[index + 2] as char).to_digit(16));
      if let Some((high, low)) = digits {
        output.push((high * 16 + low) as u8);
        index += 3;
        continue;
      }
    }
    output.push(bytes[index]);
    index += 1;
  }
  String::from_utf8(output).unwrap_or_else(|_| value.into())
}

pub fn is_missing(
  link: &Link,
  documents: &BTreeMap<String, Arc<Document>>,
  paths: &BTreeSet<String>,
) -> bool {
  if link.is_external {
    return false;
  }
  let Some(path) = &link.target_path else {
    return true;
  };
  if !paths.contains(path) {
    return true;
  }
  link.target_heading_slug.as_ref().is_some_and(|anchor| {
    documents
      .get(path)
      .is_none_or(|file| !file.headings.iter().any(|heading| &heading.slug == anchor))
  })
}
