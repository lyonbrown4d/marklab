use super::{Index, graph_types::*};
use crate::error::{BackendError, BackendResult};
use fjadra::{Link, ManyBody, Node, PositionX, PositionY, SimulationBuilder};
use moka::sync::Cache;
use std::{collections::BTreeMap, sync::Arc, time::Duration};

const LAYOUT_VERSION: u8 = 1;
pub(super) type Positions = BTreeMap<String, GraphPosition>;
pub(super) type LayoutCache = Cache<LayoutKey, Arc<Positions>>;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub(super) struct LayoutKey {
  generation: u64,
  scope: String,
  topology: String,
  version: u8,
}

pub(super) fn cache() -> LayoutCache {
  Cache::builder()
    .name("analysis-graph-layouts")
    .max_capacity(8 * 1024 * 1024)
    .time_to_live(Duration::from_secs(15 * 60))
    .weigher(|key: &LayoutKey, positions: &Arc<Positions>| {
      positions
        .keys()
        .fold(key.scope.len() + key.topology.len() + 128, |bytes, id| {
          bytes.saturating_add(id.len() + 96)
        })
        .min(u32::MAX as usize) as u32
    })
    .build()
}

pub(super) fn positions(
  cache: &LayoutCache,
  index: &Index,
  graph: &WorkspaceGraph,
) -> BackendResult<Arc<Positions>> {
  let key = LayoutKey {
    generation: index.generation,
    scope: index.scope.clone(),
    topology: graph.topology_key.clone(),
    version: LAYOUT_VERSION,
  };
  // Called inside the existing bounded blocking worker. Moka coalesces identical
  // topologies across query revisions without retaining document text or labels.
  cache
    .try_get_with(key, || compute(graph).map(Arc::new))
    .map_err(|error: Arc<BackendError>| (*error).clone())
}

fn compute(graph: &WorkspaceGraph) -> BackendResult<Positions> {
  let mut ids: Vec<_> = graph.nodes.iter().map(GraphNode::id).collect();
  ids.sort_unstable();
  if ids.is_empty() {
    return Ok(BTreeMap::new());
  }
  if ids.len() == 1 {
    return Ok(BTreeMap::from([(
      ids[0].to_owned(),
      GraphPosition::default(),
    )]));
  }
  let indices: BTreeMap<_, _> = ids.iter().enumerate().map(|(i, id)| (*id, i)).collect();
  let mut edges: Vec<_> = graph.edges.iter().collect();
  edges.sort_unstable_by(|left, right| left.id.cmp(&right.id));
  let mut degrees = vec![0usize; ids.len()];
  let mut pairs = Vec::with_capacity(edges.len());
  for edge in &edges {
    let source = indices.get(edge.source.as_str());
    let target = indices.get(edge.target.as_str());
    let (Some(&source), Some(&target)) = (source, target) else {
      return Err(failed("Graph layout edge has an unavailable endpoint"));
    };
    if source == target {
      continue;
    }
    degrees[source] += 1;
    degrees[target] += 1;
    pairs.push((source, target, edge.count));
  }
  let strengths: Vec<_> = pairs
    .iter()
    .map(|&(source, target, count)| {
      let occurrences = (1.0 + (count.max(1) as f64).ln()).min(4.0);
      let degree = degrees[source].min(degrees[target]).max(1) as f64;
      (0.35 * occurrences / degree).min(0.9)
    })
    .collect();
  let links: Vec<_> = pairs
    .iter()
    .map(|&(source, target, _)| (source, target))
    .collect();
  let ticks = match ids.len() {
    0..=250 => 160,
    251..=2_000 => 96,
    _ => 48,
  };
  let decay = 1.0 - 0.001_f64.powf(1.0 / ticks as f64);
  // Canonical input order, fjadra's fixed default LCG seed and its ordered force
  // map make every fixed-length run reproducible. No wall-clock cutoff changes
  // the result on slower machines, and no per-pair repulsion loop is introduced.
  let mut simulation = SimulationBuilder::default()
    .with_alpha_decay(decay)
    .build(ids.iter().map(|_| Node::default()))
    .add_force("charge", ManyBody::default().strength(-120.0))
    .add_force(
      "links",
      Link::new(links)
        .distance(70.0)
        .strength(move |_: &_, i: usize| strengths[i]),
    )
    .add_force("x", PositionX::default().strength(0.003))
    .add_force("y", PositionY::default().strength(0.003));
  for _ in 0..ticks {
    simulation.tick(1);
    if simulation
      .positions()
      .any(|[x, y]| !x.is_finite() || !y.is_finite())
    {
      return Err(failed("Graph layout produced a non-finite position"));
    }
  }
  Ok(
    ids
      .into_iter()
      .zip(simulation.positions())
      .map(|(id, [x, y])| (id.to_owned(), GraphPosition { x, y }))
      .collect(),
  )
}

fn failed(message: &str) -> BackendError {
  BackendError::new("GRAPH_LAYOUT_FAILED", message)
}
