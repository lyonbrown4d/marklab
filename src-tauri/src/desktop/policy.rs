use std::path::{Path, PathBuf};
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
pub fn argument_targets(args: &[String], cwd: &Path) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|value| !value.starts_with('-') && !value.contains('\0') && !value.contains("://"))
        .filter_map(|value| {
            let path = PathBuf::from(value);
            let path = if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            };
            // Development process arguments can include app entry points; open document/directory arguments only.
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            (!matches!(extension, "js" | "mjs" | "cjs" | "asar"))
                .then(|| path.to_string_lossy().into_owned())
        })
        .collect()
}
pub fn visible_rectangle(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    displays: &[(i32, i32, u32, u32)],
) -> bool {
    displays.iter().any(|(dx, dy, dw, dh)| {
        let (x, y, w, h, dx, dy, dw, dh) = (
            i64::from(x),
            i64::from(y),
            i64::from(width),
            i64::from(height),
            i64::from(*dx),
            i64::from(*dy),
            i64::from(*dw),
            i64::from(*dh),
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
        assert!(visible_rectangle(
            -1000,
            0,
            800,
            600,
            &[(-1920, 0, 1920, 1080)]
        ));
        assert!(!visible_rectangle(
            10000,
            0,
            800,
            600,
            &[(0, 0, 1920, 1080)]
        ));
        assert!(!visible_rectangle(
            i32::MAX,
            i32::MAX,
            u32::MAX,
            u32::MAX,
            &[(0, 0, 1920, 1080)]
        ));
    }
}
