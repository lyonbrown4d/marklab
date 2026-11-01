use super::{Index, graph_query, graph_types::*};
use crate::error::BackendResult;
use std::collections::BTreeMap;

pub fn graph(index: &Index, request: WorkspaceGraphRequest) -> BackendResult<WorkspaceGraph> {
  graph_query::validate(&request)?;
  let mut nodes = BTreeMap::new();
  let mut edges = BTreeMap::<(String, String, EdgeKind), GraphEdge>::new();
  for document in index.files.values() {
    let id = format!("file:{}", document.path);
    let folder = document
      .path
      .rsplit_once('/')
      .map_or("Workspace", |(folder, _)| folder);
    nodes.insert(
      id.clone(),
      GraphNode::File {
        id,
        label: document.title.clone(),
        position: GraphPosition::default(),
        path: document.path.clone(),
        group: GraphGroup {
          key: folder.into(),
          label: folder.into(),
          source: GroupSource::Path,
        },
      },
    );
  }
  for document in index.files.values() {
    let source = format!("file:{}", document.path);
    for (link, attachment) in document
      .links
      .iter()
      .map(|link| (link, false))
      .chain(document.assets.iter().map(|link| (link, true)))
    {
      if link.is_external || (attachment && !request.include_attachments) {
        continue;
      }
      // Unresolved unsafe paths never become graph endpoints or native-open targets.
      let Some(path) = link.target_path.as_deref() else {
        continue;
      };
      let attachment_path = std::path::Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
          !extension.eq_ignore_ascii_case("md") && !extension.eq_ignore_ascii_case("markdown")
        });
      if attachment_path && !request.include_attachments && !index.files.contains_key(path) {
        continue;
      }
      // Heading diagnostics do not change the identity of an existing document.
      let missing = !index.files.contains_key(path) && !index.paths.contains(path);
      if missing && !request.include_missing {
        continue;
      }
      let file = index.files.contains_key(path) && !missing;
      if !file && !missing && !request.include_attachments {
        continue;
      }
      let prefix = if missing {
        "missing"
      } else if file {
        "file"
      } else {
        "preview"
      };
      let target = format!("{prefix}:{path}");
      if source == target {
        continue;
      }
      let kind = if !file && !missing {
        EdgeKind::Previews
      } else if link.target_heading_slug.is_some() {
        EdgeKind::ReferencesHeading
      } else {
        EdgeKind::LinksTo
      };
      nodes.entry(target.clone()).or_insert_with(|| {
        if missing {
          GraphNode::Missing {
            id: target.clone(),
            label: path.into(),
            path: path.into(),
            source_path: document.path.clone(),
            target: link.target.clone(),
            preview_kind: preview_kind(path),
            position: GraphPosition::default(),
          }
        } else {
          GraphNode::Preview {
            id: target.clone(),
            label: path.into(),
            path: path.into(),
            source_path: document.path.clone(),
            target: link.target.clone(),
            preview_kind: preview_kind(path),
            position: GraphPosition::default(),
          }
        }
      });
      let key = (source.clone(), target.clone(), kind.clone());
      let edge = edges.entry(key).or_insert_with(|| GraphEdge {
        id: format!(
          "edge:{}:{source}:{}:{}:{target}",
          source.len(),
          match kind {
            EdgeKind::LinksTo => "links_to",
            EdgeKind::ReferencesHeading => "references_heading",
            EdgeKind::Previews => "previews",
          },
          target.len()
        ),
        source: source.clone(),
        target,
        kind,
        count: 0,
      });
      edge.count = edge.count.saturating_add(1);
    }
  }
  graph_query::select(index, request, nodes, edges.into_values().collect())
}

fn preview_kind(path: &str) -> PreviewKind {
  match std::path::Path::new(path)
    .extension()
    .and_then(|ext| ext.to_str())
    .unwrap_or("")
    .to_lowercase()
    .as_str()
  {
    "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" => PreviewKind::Image,
    "pdf" => PreviewKind::Pdf,
    "docx" => PreviewKind::Docx,
    "mp3" | "wav" | "ogg" => PreviewKind::Audio,
    "mp4" | "webm" => PreviewKind::Video,
    "drawio" => PreviewKind::Drawio,
    "excalidraw" => PreviewKind::Excalidraw,
    "xlsx" | "xlsm" => PreviewKind::Spreadsheet,
    _ => PreviewKind::Source,
  }
}
