use super::{
  document::{Link, LinkKind},
  graph_types::GraphNode,
};

pub(super) fn node(link: &Link) -> Option<GraphNode> {
  if link.link_type != LinkKind::Markdown {
    return None;
  }
  let url = url::Url::parse(&link.target).ok()?;
  if !matches!(url.scheme(), "http" | "https")
    || !url.username().is_empty()
    || url.password().is_some()
  {
    return None;
  }
  let host = url.host_str()?;
  let text = link.text.trim();
  let raw_web_url =
    url::Url::parse(text).is_ok_and(|label| matches!(label.scheme(), "http" | "https"));
  let label = if text.is_empty() || raw_web_url {
    host
  } else {
    text
  }
  .to_owned();
  Some(GraphNode::External {
    id: format!("external:{url}"),
    label,
    url: url.into(),
  })
}
