use super::super::{layout_types::*, layout_validation};
use super::fixture;
use serde_json::json;

#[test]
fn typed_layout_roundtrip_and_graph_validation() {
  let layout = fixture();
  layout_validation::validate(&layout).unwrap();
  let value = serde_json::to_value(&layout).unwrap();
  assert_eq!(
    serde_json::from_value::<WorkspaceLayout>(value.clone()).unwrap(),
    layout
  );
  let mutations: [fn(&mut serde_json::Value); 6] = [
    |value: &mut serde_json::Value| {
      value["grid"]["root"]["data"][1]["data"]["views"] = json!(["a"])
    },
    |value: &mut serde_json::Value| {
      value["grid"]["root"]["data"][1]["data"]["id"] = json!("group-a")
    },
    |value: &mut serde_json::Value| {
      value["grid"]["root"]["data"][0]["data"]["activeView"] = json!("b")
    },
    |value: &mut serde_json::Value| value["activeGroup"] = json!("missing"),
    |value: &mut serde_json::Value| {
      value["panels"]["a"]["params"]["tab"]["route"] = json!("/files/edit/%2e%2e/escape")
    },
    |value: &mut serde_json::Value| {
      value["panels"]["a"]["params"]["tab"]["route"] = json!("https://example.com")
    },
  ];
  for mutate in mutations {
    let mut invalid = value.clone();
    mutate(&mut invalid);
    assert!(layout_validation::validate(&serde_json::from_value(invalid).unwrap()).is_err());
  }
  let mut unknown = value;
  unknown["panels"]["a"]["params"]["content"] = json!("document text");
  assert!(serde_json::from_value::<WorkspaceLayout>(unknown).is_err());
}

#[test]
fn grid_limits_and_safe_route_contract() {
  let mut layout = fixture();
  layout.grid.width = f64::NAN;
  assert!(layout_validation::validate(&layout).is_err());
  layout.grid.width = 100_001.0;
  assert!(layout_validation::validate(&layout).is_err());
  layout = fixture();
  for _ in 0..17 {
    layout.grid.root = WorkspaceLayoutNode::Branch {
      data: vec![layout.grid.root],
      size: None,
    };
  }
  assert!(layout_validation::validate(&layout).is_err());
  for route in [
    "//evil",
    "/web/transient",
    "/files/edit/C:%5csecret",
    "/files/edit/%00",
    "/files/edit//absolute",
    "/files/edit/a/../b",
  ] {
    assert!(layout_validation::route_path(route).is_err(), "{route}");
  }
  assert_eq!(
    layout_validation::route_path("/files/source/dir/My%20File.md").unwrap(),
    Some("dir/My File.md".into())
  );
  assert_eq!(
    layout_validation::route_path("/_diff/staged/a.md").unwrap(),
    Some("a.md".into())
  );
  assert_eq!(
    layout_validation::route_path("/workspace/pages?collection=x").unwrap(),
    None
  );
  for path in ["100%.md", "literal%2.md", "%FF.md"] {
    assert_eq!(
      layout_validation::route_path(&format!("/files/edit/{path}")).unwrap(),
      Some(path.into())
    );
  }
  let mut empty = fixture();
  layout_validation::prune(&mut empty, &Default::default());
  layout_validation::validate(&empty).unwrap();
  assert!(empty.panels.is_empty());
}

#[test]
fn bounded_panel_group_node_and_payload_sizes() {
  let mut layout = fixture();
  let panel = layout.panels["a"].clone();
  layout.panels.clear();
  let mut views = Vec::new();
  for index in 0..201 {
    let id = index.to_string();
    let mut entry = panel.clone();
    entry.id = id.clone();
    entry.params.tab.id = id.clone();
    layout.panels.insert(id.clone(), entry);
    views.push(id);
  }
  layout.grid.root = WorkspaceLayoutNode::Leaf {
    data: WorkspaceLayoutGroup {
      id: "group-a".into(),
      active_view: views[0].clone(),
      views,
    },
    size: None,
  };
  assert!(layout_validation::validate(&layout).is_err());

  let mut layout = fixture();
  layout.panels.clear();
  layout.active_group = None;
  layout.grid.root = WorkspaceLayoutNode::Branch {
    data: (0..64)
      .map(|_| WorkspaceLayoutNode::Branch {
        data: vec![WorkspaceLayoutNode::Branch {
          data: vec![],
          size: None,
        }],
        size: None,
      })
      .collect(),
    size: None,
  };
  assert!(layout_validation::validate(&layout).is_err());

  let mut layout = fixture();
  layout.panels.clear();
  let mut groups = Vec::new();
  for index in 0..65 {
    let id = format!("panel-{index}");
    let mut panel = panel.clone();
    panel.id = id.clone();
    panel.params.tab.id = id.clone();
    layout.panels.insert(id.clone(), panel);
    groups.push(WorkspaceLayoutNode::Leaf {
      data: WorkspaceLayoutGroup {
        id: format!("group-{index}"),
        views: vec![id.clone()],
        active_view: id,
      },
      size: None,
    });
  }
  layout.grid.root = WorkspaceLayoutNode::Branch {
    data: vec![
      WorkspaceLayoutNode::Branch {
        data: groups.drain(..32).collect(),
        size: None,
      },
      WorkspaceLayoutNode::Branch {
        data: groups,
        size: None,
      },
    ],
    size: None,
  };
  layout.active_group = None;
  assert!(layout_validation::validate(&layout).is_err());

  // Each individual panel is bounded; the combined snapshot must be bounded too.
  let mut layout = fixture();
  layout.panels.clear();
  let mut ids = Vec::new();
  for index in 0..100 {
    let id = format!("large-{index}");
    let mut panel = panel.clone();
    panel.id = id.clone();
    panel.params.tab.id = id.clone();
    panel.params.tab.route = format!("/files/edit/{}.md", "a".repeat(6000));
    layout.panels.insert(id.clone(), panel);
    ids.push(id);
  }
  layout.grid.root = WorkspaceLayoutNode::Leaf {
    data: WorkspaceLayoutGroup {
      id: "group-a".into(),
      active_view: ids[0].clone(),
      views: ids,
    },
    size: None,
  };
  assert!(layout_validation::validate(&layout).is_err());
}
