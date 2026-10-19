#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
  Loading,
  Failed,
  Interactive,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReadyAction {
  KeepLoading,
  ShowWorkspace,
  ShowFailure,
  Ignore,
}
pub fn accepts_ready_attempt(expected: u64, provided: Option<u64>, phase: &str) -> bool {
  phase == "shell" || provided == Some(expected)
}
pub fn ready_action(current: Phase, signal: &str) -> ReadyAction {
  match (current, signal) {
    (_, "shell") => ReadyAction::KeepLoading,
    (Phase::Loading | Phase::Failed, "workspace-interactive") => ReadyAction::ShowWorkspace,
    (Phase::Loading, "workspace-error") => ReadyAction::ShowFailure,
    _ => ReadyAction::Ignore,
  }
}
pub fn normalize_locale(locale: &str) -> &'static str {
  if locale.to_ascii_lowercase().starts_with("zh") {
    "zh-CN"
  } else {
    "en-US"
  }
}
pub fn choose_startup_target(
  native: Option<String>,
  arguments: Option<String>,
  saved: Option<String>,
) -> Option<String> {
  native.or(arguments).or(saved)
}
pub struct DisplayArea {
  pub x: i32,
  pub y: i32,
  pub width: u32,
  pub height: u32,
  pub scale_factor: f64,
}
pub fn visible_rectangle(
  x: i32,
  y: i32,
  width: u32,
  height: u32,
  displays: &[DisplayArea],
) -> bool {
  displays.iter().any(|display| {
    if !display.scale_factor.is_finite() || display.scale_factor <= 0.0 {
      return false;
    }
    // Persisted sizes are logical pixels, while desktop positions and
    // monitor work areas are physical. Each monitor has its own DPI.
    let size = tauri::LogicalSize::new(width, height).to_physical::<u32>(display.scale_factor);
    let (x, y, w, h, dx, dy, dw, dh) = (
      i64::from(x),
      i64::from(y),
      i64::from(size.width),
      i64::from(size.height),
      i64::from(display.x),
      i64::from(display.y),
      i64::from(display.width),
      i64::from(display.height),
    );
    x < dx + dw && x + w > dx && y < dy + dh && y + h > dy
  })
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn shell_and_timeout_do_not_present_an_unready_workspace() {
    assert_eq!(
      ready_action(Phase::Loading, "shell"),
      ReadyAction::KeepLoading
    );
    assert_eq!(
      ready_action(Phase::Loading, "workspace-error"),
      ReadyAction::ShowFailure
    );
    assert_eq!(
      ready_action(Phase::Failed, "workspace-interactive"),
      ReadyAction::ShowWorkspace
    );
    assert_eq!(
      ready_action(Phase::Interactive, "workspace-error"),
      ReadyAction::Ignore
    );
  }
  #[test]
  fn stale_workspace_readiness_cannot_present_a_later_native_open() {
    assert!(!accepts_ready_attempt(2, Some(1), "workspace-interactive"));
    assert!(!accepts_ready_attempt(2, None, "workspace-interactive"));
    assert!(accepts_ready_attempt(2, Some(2), "workspace-interactive"));
    assert!(accepts_ready_attempt(2, None, "shell"));
  }
  #[test]
  fn finder_open_takes_precedence_over_argument_and_restored_workspaces() {
    assert_eq!(
      choose_startup_target(
        Some("native.md".into()),
        Some("argument.md".into()),
        Some("saved".into())
      ),
      Some("native.md".into())
    );
    assert_eq!(
      choose_startup_target(None, Some("argument.md".into()), Some("saved".into())),
      Some("argument.md".into())
    );
  }
  #[test]
  fn geometry_checks_support_negative_monitors_and_reject_disconnected_displays() {
    let display = |x| DisplayArea {
      x,
      y: 0,
      width: 1920,
      height: 1080,
      scale_factor: 1.0,
    };
    assert!(visible_rectangle(-1000, 0, 800, 600, &[display(-1920)]));
    assert!(!visible_rectangle(10000, 0, 800, 600, &[display(0)]));
    assert!(!visible_rectangle(
      i32::MAX,
      i32::MAX,
      u32::MAX,
      u32::MAX,
      &[display(0)]
    ));
  }
  #[test]
  fn restored_logical_sizes_use_the_target_monitors_scale() {
    let display = |scale_factor| DisplayArea {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      scale_factor,
    };
    assert!(!visible_rectangle(-1100, 0, 800, 600, &[display(1.0)]));
    assert!(visible_rectangle(-1100, 0, 800, 600, &[display(2.0)]));
    assert!(!visible_rectangle(0, -900, 800, 600, &[display(1.0)]));
    assert!(visible_rectangle(0, -900, 800, 600, &[display(2.0)]));
    for scale in [0.0, -1.0, f64::NAN, f64::INFINITY] {
      assert!(!visible_rectangle(0, 0, 800, 600, &[display(scale)]));
    }
  }
}
