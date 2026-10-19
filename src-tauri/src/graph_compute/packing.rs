use super::{
    jobs::Job,
    types::{GraphLayoutComputeNode, GraphLayoutPosition},
};
use crate::error::{BackendError, BackendResult};
use rectangle_pack::{
    GroupedRectsToPlace, RectToInsert, TargetBin, contains_smallest_box, pack_rects,
    volume_heuristic,
};
use std::collections::BTreeMap;

struct Packed {
    positions: Vec<(f64, f64)>,
    width: f64,
    height: f64,
}

pub(super) fn layout(
    nodes: &[GraphLayoutComputeNode],
    grouped: bool,
    job: &Job,
) -> BackendResult<Vec<GraphLayoutPosition>> {
    if nodes.is_empty() {
        return Ok(Vec::new());
    }
    let mut groups: BTreeMap<&str, Vec<&GraphLayoutComputeNode>> = BTreeMap::new();
    let mut units = Vec::new();
    let mut contents: Vec<Vec<GraphLayoutPosition>> = Vec::new();
    for node in nodes {
        if grouped && let Some(group) = node.group.as_deref() {
            groups.entry(group).or_default().push(node);
        } else {
            units.push((node.width, node.height));
            contents.push(vec![GraphLayoutPosition {
                id: node.id.clone(),
                x: 0.0,
                y: 0.0,
            }]);
        }
    }
    for members in groups.values() {
        job.check()?;
        let sizes: Vec<_> = members
            .iter()
            .map(|node| (node.width, node.height))
            .collect();
        let packed = pack(&sizes, 56, 1.6, job)?;
        units.push((packed.width + 112.0, packed.height + 120.0));
        contents.push(
            members
                .iter()
                .zip(packed.positions)
                .map(|(node, (x, y))| GraphLayoutPosition {
                    id: node.id.clone(),
                    x: x + 56.0,
                    y: y + 72.0,
                })
                .collect(),
        );
    }
    let packed = pack(&units, 120, 3.0, job)?;
    let mut positions = Vec::with_capacity(nodes.len());
    for (children, (x, y)) in contents.into_iter().zip(packed.positions) {
        positions.extend(children.into_iter().map(|mut position| {
            position.x += x + 24.0;
            position.y += y + 24.0;
            position
        }));
    }
    Ok(positions)
}

fn pack(sizes: &[(f64, f64)], gap: u32, aspect: f64, job: &Job) -> BackendResult<Packed> {
    if sizes.len() > 256 {
        // Bound each third-party packing problem. Larger whole-workspace views
        // compose packed batches without dropping nodes or blocking small tabs.
        let mut batches = Vec::new();
        for chunk in sizes.chunks(256) {
            job.check()?;
            batches.push(pack(chunk, gap, aspect, job)?);
        }
        let bounds: Vec<_> = batches
            .iter()
            .map(|batch| (batch.width, batch.height))
            .collect();
        let outer = pack(&bounds, gap, aspect, job)?;
        let mut positions = Vec::with_capacity(sizes.len());
        for (batch, (x, y)) in batches.into_iter().zip(&outer.positions) {
            positions.extend(
                batch
                    .positions
                    .into_iter()
                    .map(|(left, top)| (left + x, top + y)),
            );
        }
        return Ok(Packed {
            positions,
            width: outer.width,
            height: outer.height,
        });
    }
    let mut rects: GroupedRectsToPlace<usize, ()> = GroupedRectsToPlace::new();
    let mut area = 0_u64;
    let mut row_width = 0_u32;
    let mut max_width = 1_u32;
    let mut max_height = 1_u32;
    for (index, &(width, height)) in sizes.iter().enumerate() {
        let width = width.ceil() as u32 + gap;
        let height = height.ceil() as u32 + gap;
        area += u64::from(width) * u64::from(height);
        row_width = row_width.checked_add(width).ok_or_else(failed)?;
        max_width = max_width.max(width);
        max_height = max_height.max(height);
        rects.push_rect(index, None, RectToInsert::new(width, height, 1));
    }
    let mut width = ((area as f64 * aspect).sqrt().ceil() as u32).max(max_width);
    let mut height = ((area as f64 / f64::from(width) * 1.2).ceil() as u32).max(max_height);
    for attempt in 0..=16 {
        job.check()?;
        // A single-row bin is a finite, guaranteed-fit final attempt.
        if attempt == 16 {
            width = row_width;
            height = max_height;
        }
        let mut bins = BTreeMap::from([(0_u8, TargetBin::new(width, height, 1))]);
        if let Ok(result) = pack_rects(&rects, &mut bins, &volume_heuristic, &contains_smallest_box)
        {
            let locations = result.packed_locations();
            let mut positions = Vec::with_capacity(sizes.len());
            let mut right = 0.0_f64;
            let mut bottom = 0.0_f64;
            for (index, &(node_width, node_height)) in sizes.iter().enumerate() {
                let (_, location) = locations.get(&index).ok_or_else(failed)?;
                let x = f64::from(location.x());
                let y = f64::from(location.y());
                positions.push((x, y));
                right = right.max(x + node_width);
                bottom = bottom.max(y + node_height);
            }
            return Ok(Packed {
                positions,
                width: right,
                height: bottom,
            });
        }
        width = (width.saturating_add(width / 3 + 1)).min(row_width);
        height = height.saturating_add(height / 3 + 1);
    }
    Err(failed())
}

fn failed() -> BackendError {
    BackendError::new("graph_layout_failed", "Unable to pack graph geometry")
}
