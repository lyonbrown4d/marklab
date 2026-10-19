use super::{
    tests::{assert_geometry, node},
    *,
};

#[test]
fn deep_diamond_graph_does_not_enumerate_all_directed_paths() {
    let mut request = GraphLayoutComputeRequest {
        request_id: "diamonds".into(),
        mode: GraphLayoutMode::Focus,
        nodes: (0..81)
            .map(|index| node(&format!("n{index:03}"), 100.0 + index as f64, 60.0, None))
            .collect(),
        edges: Vec::new(),
    };
    for level in 0..40 {
        let targets = [1 + level * 2, 2 + level * 2];
        let sources = if level == 0 {
            vec![0]
        } else {
            vec![level * 2 - 1, level * 2]
        };
        for source in sources {
            for target in targets {
                request.edges.push(GraphLayoutComputeEdge {
                    source: format!("n{source:03}"),
                    target: format!("n{target:03}"),
                });
            }
        }
    }
    request.normalize().unwrap();
    let positions = layered::layout(&request.nodes, &request.edges, &jobs::Job::new()).unwrap();
    assert_geometry(&request, &positions);
}

#[test]
fn long_edge_expansion_budget_falls_back_before_layered_work() {
    let mut request = GraphLayoutComputeRequest {
        request_id: "long-edges".into(),
        mode: GraphLayoutMode::Focus,
        nodes: (0..100)
            .map(|index| node(&format!("n{index:03}"), 100.0, 60.0, None))
            .collect(),
        edges: (0..99)
            .map(|source| GraphLayoutComputeEdge {
                source: format!("n{source:03}"),
                target: format!("n{:03}", source + 1),
            })
            .collect(),
    };
    request
        .edges
        .extend((0..50).map(|source| GraphLayoutComputeEdge {
            source: format!("n{source:03}"),
            target: "n099".into(),
        }));
    request.normalize().unwrap();
    assert!(
        edge_order::ordered_edges(&request.nodes, &request.edges)
            .unwrap()
            .estimated_dummy_nodes
            > 1500
    );
    assert!(layered::layout(&request.nodes, &request.edges, &jobs::Job::new()).is_err());
    let positions = compute(&request, &jobs::Job::new()).unwrap();
    let mut expected = packing::layout(&request.nodes, false, &jobs::Job::new()).unwrap();
    expected.sort_by(|a, b| a.id.cmp(&b.id));
    assert_eq!(positions, expected);
    assert_geometry(&request, &positions);
}

#[test]
fn whole_workspace_above_old_budget_keeps_all_geometry_without_overlaps() {
    let mut request = GraphLayoutComputeRequest {
        request_id: "large-overview".into(),
        mode: GraphLayoutMode::Overview,
        nodes: (0..5_001)
            .map(|index| node(&format!("n{index:05}"), 24.0, 24.0, None))
            .collect(),
        edges: Vec::new(),
    };
    request.normalize().unwrap();
    let positions = compute(&request, &jobs::Job::new()).unwrap();
    assert_eq!(positions.len(), request.nodes.len());
    assert_eq!(
        positions
            .iter()
            .map(|position| &position.id)
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        5_001
    );
    for (index, position) in positions.iter().enumerate() {
        assert!(position.x.is_finite() && position.y.is_finite());
        for other in &positions[..index] {
            assert!(
                position.x + 24.0 <= other.x
                    || other.x + 24.0 <= position.x
                    || position.y + 24.0 <= other.y
                    || other.y + 24.0 <= position.y
            );
        }
    }
}
