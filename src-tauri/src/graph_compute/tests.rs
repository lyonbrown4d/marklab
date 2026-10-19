use super::*;

pub(super) fn node(
    id: &str,
    width: f64,
    height: f64,
    group: Option<&str>,
) -> GraphLayoutComputeNode {
    GraphLayoutComputeNode {
        id: id.to_owned(),
        width,
        height,
        group: group.map(str::to_owned),
    }
}

fn request(mode: GraphLayoutMode) -> GraphLayoutComputeRequest {
    GraphLayoutComputeRequest {
        request_id: "layout-1".into(),
        mode,
        nodes: vec![
            node("a", 420.0, 480.0, Some("one")),
            node("b", 248.5, 112.5, Some("one")),
            node("c", 360.0, 220.0, Some("two")),
            node("isolate", 200.0, 96.0, None),
        ],
        edges: vec![
            GraphLayoutComputeEdge {
                source: "a".into(),
                target: "b".into(),
            },
            GraphLayoutComputeEdge {
                source: "b".into(),
                target: "a".into(),
            },
            GraphLayoutComputeEdge {
                source: "a".into(),
                target: "a".into(),
            },
        ],
    }
}

pub(super) fn assert_geometry(
    request: &GraphLayoutComputeRequest,
    positions: &[GraphLayoutPosition],
) {
    assert_eq!(positions.len(), request.nodes.len());
    for (index, position) in positions.iter().enumerate() {
        assert!(position.x.is_finite() && position.y.is_finite());
        let node = request
            .nodes
            .iter()
            .find(|node| node.id == position.id)
            .unwrap();
        for other in positions.iter().take(index) {
            let other_node = request
                .nodes
                .iter()
                .find(|node| node.id == other.id)
                .unwrap();
            assert!(
                position.x + node.width <= other.x
                    || other.x + other_node.width <= position.x
                    || position.y + node.height <= other.y
                    || other.y + other_node.height <= position.y,
                "{} overlaps {}",
                node.id,
                other.id
            );
        }
    }
}

#[test]
fn overview_preserves_group_padding_and_nonoverlapping_variable_dimensions() {
    let mut request = request(GraphLayoutMode::Overview);
    request.normalize().unwrap();
    let positions = compute(&request, &jobs::Job::new()).unwrap();
    assert_geometry(&request, &positions);
    assert!(
        positions
            .iter()
            .all(|position| position.x >= 24.0 && position.y >= 24.0)
    );
    let grouped = positions
        .iter()
        .find(|position| position.id == "a")
        .unwrap();
    assert!(grouped.x >= 24.0 + 56.0 && grouped.y >= 24.0 + 72.0);
}

#[test]
fn layered_handles_cycles_self_loops_isolates_and_keeps_right_direction() {
    let mut request = request(GraphLayoutMode::Focus);
    request.normalize().unwrap();
    let positions = layered::layout(&request.nodes, &request.edges, &jobs::Job::new()).unwrap();
    assert_geometry(&request, &positions);
    request.edges = vec![GraphLayoutComputeEdge {
        source: "a".into(),
        target: "b".into(),
    }];
    let positions = layered::layout(&request.nodes, &request.edges, &jobs::Job::new()).unwrap();
    let a = positions
        .iter()
        .find(|position| position.id == "a")
        .unwrap();
    let b = positions
        .iter()
        .find(|position| position.id == "b")
        .unwrap();
    assert!(a.x + 420.0 <= b.x);
}

#[test]
fn large_or_dense_focus_uses_bounded_native_packing() {
    for (count, edge_count) in [(301_usize, 0_usize), (26, 601)] {
        let mut request = GraphLayoutComputeRequest {
            request_id: "dense".into(),
            mode: GraphLayoutMode::Focus,
            nodes: (0..count)
                .map(|id| node(&id.to_string(), 248.0, 112.0, None))
                .collect(),
            edges: (0..edge_count)
                .map(|id| GraphLayoutComputeEdge {
                    source: (id / count).to_string(),
                    target: (id % count).to_string(),
                })
                .collect(),
        };
        request.normalize().unwrap();
        let mut expected = packing::layout(&request.nodes, false, &jobs::Job::new()).unwrap();
        expected.sort_by(|a, b| a.id.cmp(&b.id));
        let positions = compute(&request, &jobs::Job::new()).unwrap();
        assert_eq!(positions, expected);
        assert_geometry(&request, &positions);
    }
}

#[test]
fn input_order_and_request_id_do_not_change_geometry_or_cache_identity() {
    for mode in [GraphLayoutMode::Focus, GraphLayoutMode::Overview] {
        let mut first = request(mode);
        let mut second = first.clone();
        second.request_id = "different".into();
        second.nodes.reverse();
        second.edges.reverse();
        first.normalize().unwrap();
        second.normalize().unwrap();
        assert_eq!(
            compute(&first, &jobs::Job::new()).unwrap(),
            compute(&second, &jobs::Job::new()).unwrap()
        );
        assert_eq!(
            cache_key("window", "workspace", &first).unwrap(),
            cache_key("window", "workspace", &second).unwrap()
        );
        assert_ne!(
            cache_key("window", "workspace", &first).unwrap(),
            cache_key("window", "other", &first).unwrap()
        );
        second.nodes[0].width += 1.0;
        assert_ne!(
            cache_key("window", "workspace", &first).unwrap(),
            cache_key("window", "workspace", &second).unwrap()
        );
    }
}

#[test]
fn invalid_geometry_and_unknown_endpoints_are_rejected_before_layout() {
    let mut invalids = Vec::new();
    for size in [f64::NAN, f64::INFINITY, 23.0, 20_001.0] {
        let mut request = request(GraphLayoutMode::Focus);
        request.nodes[0].width = size;
        invalids.push(request);
    }
    let mut duplicate = request(GraphLayoutMode::Focus);
    duplicate.nodes.push(duplicate.nodes[0].clone());
    invalids.push(duplicate);
    let mut dangling = request(GraphLayoutMode::Focus);
    dangling.edges[0].target = "missing".into();
    invalids.push(dangling);
    for mut request in invalids {
        assert_eq!(
            request.normalize().unwrap_err().code,
            "invalid_graph_layout"
        );
    }
}

#[test]
fn layout_and_community_jobs_in_one_window_do_not_cancel_each_other() {
    let jobs = Jobs::default();
    let layout = ActiveJob::begin(&jobs, "window", JobKind::Layout, "layout").unwrap();
    let community = ActiveJob::begin(&jobs, "window", JobKind::Community, "community").unwrap();
    assert!(layout.job.check().is_ok());
    assert!(community.job.check().is_ok());
    let _next = ActiveJob::begin(&jobs, "window", JobKind::Layout, "layout-next").unwrap();
    assert!(layout.job.check().is_err());
    assert!(community.job.check().is_ok());
}

#[tokio::test]
async fn queued_cancellation_is_owner_scoped_and_completes_before_capacity_returns() {
    let service = GraphComputeService::new();
    let _capacity = service.workers.clone().acquire_many_owned(2).await.unwrap();
    let computation =
        service.compute_layout("window-a", "workspace", request(GraphLayoutMode::Focus));
    tokio::pin!(computation);
    tokio::select! {
        biased;
        _ = &mut computation => panic!("Queued layout unexpectedly completed"),
        _ = tokio::task::yield_now() => {},
    }
    service.cancel("window-b", "layout-1").unwrap();
    assert!(
        service
            .jobs
            .lock()
            .unwrap()
            .values()
            .all(|job| job.check().is_ok())
    );
    service.cancel("window-a", "layout-1").unwrap();
    assert_eq!(
        computation.await.unwrap_err().code,
        "graph_layout_cancelled"
    );
}

#[tokio::test]
async fn newer_window_request_supersedes_queued_geometry() {
    let service = GraphComputeService::new();
    let _capacity = service.workers.clone().acquire_many_owned(2).await.unwrap();
    let old = service.compute_layout("window", "workspace", request(GraphLayoutMode::Focus));
    tokio::pin!(old);
    tokio::select! { biased; _ = &mut old => panic!("Unexpected completion"), _ = tokio::task::yield_now() => {} }
    let mut newer = request(GraphLayoutMode::Overview);
    newer.request_id = "layout-2".into();
    let next = service.compute_layout("window", "workspace", newer);
    tokio::pin!(next);
    tokio::select! { biased; _ = &mut next => panic!("Unexpected completion"), _ = tokio::task::yield_now() => {} }
    assert_eq!(old.await.unwrap_err().code, "graph_layout_cancelled");
    service.cancel("window", "layout-2").unwrap();
    assert_eq!(next.await.unwrap_err().code, "graph_layout_cancelled");
}
