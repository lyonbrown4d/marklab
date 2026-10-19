use super::{
    jobs::Job,
    types::{GraphLayoutComputeEdge, GraphLayoutComputeNode, GraphLayoutPosition},
};
use crate::error::{BackendError, BackendResult};
use layout::{
    core::{base::Orientation, format::Visible, geometry::Point, style::StyleAttr},
    std_shapes::shapes::{Arrow, Element, ShapeKind},
    topo::{layout::VisualGraph, placer::Placer},
};
use std::collections::BTreeMap;

pub(super) fn layout(
    nodes: &[GraphLayoutComputeNode],
    edges: &[GraphLayoutComputeEdge],
    job: &Job,
) -> BackendResult<Vec<GraphLayoutPosition>> {
    if nodes.is_empty() {
        return Ok(Vec::new());
    }
    let ordered = super::edge_order::ordered_edges(nodes, edges)?;
    if ordered.estimated_dummy_nodes > 1500 {
        return Err(failed());
    }
    let direction = Orientation::LeftToRight;
    let mut graph = VisualGraph::new(direction);
    // Application input validation plus canonical acyclic edges replace the
    // library's repeated path-enumerating invariant checks.
    graph.dag.set_validate(false);
    let mut handles = BTreeMap::new();
    for node in nodes {
        let shape = Element::create(
            ShapeKind::new_box(""),
            StyleAttr::simple(),
            direction,
            Point::new(node.width, node.height),
        );
        handles.insert(node.id.as_str(), graph.add_node(shape));
    }
    for (source, target) in ordered.edges {
        let from = handles.get(nodes[source].id.as_str()).ok_or_else(failed)?;
        let to = handles.get(nodes[target].id.as_str()).ok_or_else(failed)?;
        graph.add_edge(Arrow::simple(""), *from, *to);
    }
    job.check()?;
    // Run the public lowering/placement stages without creating SVG output.
    // Self-links have no effect on card placement and are omitted at this boundary.
    graph.to_valid_dag();
    graph.split_text_edges();
    graph.split_long_edges(false);
    let lowered: Vec<_> = graph.iter_nodes().collect();
    for handle in lowered {
        graph.element_mut(handle).resize();
    }
    // React owns actual card dimensions; text/shape estimation must not change them.
    for node in nodes {
        let handle = *handles.get(node.id.as_str()).ok_or_else(failed)?;
        graph
            .pos_mut(handle)
            .set_size(Point::new(node.width, node.height));
    }
    job.check()?;
    Placer::new(&mut graph).layout(false);
    job.check()?;
    let mut positions = Vec::with_capacity(nodes.len());
    for node in nodes {
        let handle = *handles.get(node.id.as_str()).ok_or_else(failed)?;
        let position = graph.pos(handle);
        positions.push(GraphLayoutPosition {
            id: node.id.clone(),
            x: position.left(false),
            y: position.top(false),
        });
    }
    // Guard against library regressions or unsupported geometry. The caller can
    // fall back to rectangle packing without exposing overlapping cards.
    for (index, position) in positions.iter().enumerate() {
        if !position.x.is_finite() || !position.y.is_finite() {
            return Err(failed());
        }
        for earlier in 0..index {
            let other = &positions[earlier];
            if position.x < other.x + nodes[earlier].width
                && other.x < position.x + nodes[index].width
                && position.y < other.y + nodes[earlier].height
                && other.y < position.y + nodes[index].height
            {
                return Err(failed());
            }
        }
    }
    let min_x = positions
        .iter()
        .map(|position| position.x)
        .fold(f64::INFINITY, f64::min);
    let min_y = positions
        .iter()
        .map(|position| position.y)
        .fold(f64::INFINITY, f64::min);
    for position in &mut positions {
        position.x += 24.0 - min_x;
        position.y += 24.0 - min_y;
    }
    Ok(positions)
}

fn failed() -> BackendError {
    BackendError::new("graph_layout_failed", "Layered graph geometry is invalid")
}
