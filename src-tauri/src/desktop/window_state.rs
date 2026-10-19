use crate::{
  composition::AppPaths,
  error::{BackendError, BackendResult},
};
use tauri::AppHandle;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

// Visibility belongs to StartupState; decorations belong to the custom titlebar.
// Maximization remains workspace-scoped and is applied only after editor readiness.
fn flags() -> StateFlags {
  flags_for(cfg!(target_os = "macos"))
}

fn flags_for(overlay_titlebar: bool) -> StateFlags {
  // 2.5.0 captures inner_size but restores the content rect on macOS.
  // Keep SQLite's existing sizing until the upstream overlay fix is released.
  if overlay_titlebar {
    StateFlags::POSITION
  } else {
    StateFlags::SIZE | StateFlags::POSITION
  }
}

fn tracks(label: &str) -> bool {
  // Additional workspace labels are ephemeral UUIDs. Their persistent identity
  // is the workspace key in SQLite, not a window label in the plugin's file.
  label == "main"
}

pub async fn install(app: &AppHandle) -> BackendResult<()> {
  let paths = AppPaths::resolve(app).await?;
  let app = app.clone();
  // Plugin setup reads its file synchronously. Reuse the bounded worker pool
  // and the same validated data root as the other services, including E2E.
  crate::blocking::run(move || {
    app.plugin(
      tauri_plugin_window_state::Builder::new()
        .with_filename(paths.data_dir.join("window-state.json").to_string_lossy())
        .with_state_flags(flags())
        .with_filter(tracks)
        .build(),
    )?;
    Ok(())
  })
  .await
}

pub async fn has_defaults(app: &AppHandle) -> BackendResult<bool> {
  let paths = AppPaths::resolve(app).await?;
  Ok(
    tokio::fs::metadata(paths.data_dir.join("window-state.json"))
      .await
      .is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0),
  )
}

pub async fn save_default(app: &AppHandle) -> BackendResult<()> {
  let app = app.clone();
  // The plugin's file API is synchronous; never perform its disk I/O on the UI thread.
  crate::blocking::run(move || {
    app
      .save_window_state(flags())
      .map_err(|error| BackendError::new("WINDOW_STATE_SAVE_FAILED", error.to_string()))
  })
  .await
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn defaults_never_control_presentation_or_custom_chrome() {
    assert_eq!(flags_for(true).bits(), StateFlags::POSITION.bits());
    assert_eq!(
      flags_for(false).bits(),
      (StateFlags::SIZE | StateFlags::POSITION).bits()
    );
    for flags in [flags_for(true), flags_for(false)] {
      assert!(!flags.intersects(
        StateFlags::VISIBLE
          | StateFlags::DECORATIONS
          | StateFlags::FULLSCREEN
          | StateFlags::MAXIMIZED
      ));
    }
    assert!(tracks("main"));
    for label in [
      "splash",
      "opening-main",
      "opening-workspace-a",
      "workspace-a",
      "web-a",
    ] {
      assert!(!tracks(label), "unexpected persistent window: {label}");
    }
  }
}
