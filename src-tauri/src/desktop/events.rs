use super::lifecycle::{cleanup_window, close_window, request_quit};
use crate::workspace::WorkspaceRegistry;
use tauri::{AppHandle, Manager, RunEvent, Window, WindowEvent};
pub fn window_event(window: &Window, event: &WindowEvent) {
  match event {
    WindowEvent::CloseRequested { api, .. } => {
      api.prevent_close();
      let app = window.app_handle().clone();
      let label = window.label().to_string();
      if label == "splash" {
        let _ = request_quit(&app);
      } else if label.starts_with("opening-") {
        tauri::async_runtime::spawn(async move {
          if let Some(window) = crate::native_window::get(&app, &label) {
            let _ = close_window(&window).await;
          }
        });
      }
    }
    WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
      if !window.label().starts_with("opening-") && window.label() != "splash" {
        super::geometry::changed(window.app_handle(), window.label());
        super::window_chrome::align(window);
      }
    }
    WindowEvent::Focused(true) => {
      super::window_chrome::align(window);
      let _ = super::menus::refresh_shortcuts(window.app_handle(), window.label());
    }
    WindowEvent::ThemeChanged(theme) => {
      super::window_chrome::align(window);
      let _ = crate::desktop::event_contracts::SYSTEM_THEME_CHANGED.emit_to(
        window.app_handle(),
        tauri::EventTarget::webview_window(window.label()),
        &(crate::desktop::event_contracts::SystemThemeChanged {
          color_mode: (*theme).into(),
        }),
      );
    }
    WindowEvent::Destroyed => {
      let app = window.app_handle().clone();
      let owner = window.label().to_string();
      let _ = crate::native_window::unregister(&app, &owner);
      super::geometry::remove(&app, &owner);
      if let Some(registry) = app.try_state::<WorkspaceRegistry>() {
        let _ = registry.close(&owner);
      }
      tauri::async_runtime::spawn(async move {
        let _ = cleanup_window(&app, &owner).await;
      });
    }
    _ => {}
  }
}
pub fn run_event(app: &AppHandle, event: RunEvent) {
  match event {
    RunEvent::Exit => log::logger().flush(),
    RunEvent::MainEventsCleared => super::visibility::refresh(app),
    RunEvent::ExitRequested { api, code, .. } => {
      if code.is_none() {
        api.prevent_exit();
        if cfg!(target_os = "macos")
          && app
            .try_state::<WorkspaceRegistry>()
            .is_some_and(|registry| registry.labels().is_ok_and(|labels| labels.is_empty()))
        {
          return;
        }
        let _ = request_quit(app);
      }
    }
    #[cfg(target_os = "macos")]
    RunEvent::Opened { urls } => {
      let app = app.clone();
      tauri::async_runtime::spawn(async move {
        for url in urls {
          if let Ok(path) = url.to_file_path() {
            let path = path.to_string_lossy().into_owned();
            if app
              .state::<super::startup::StartupState>()
              .queue_native(std::slice::from_ref(&path))
              .unwrap_or(true)
            {
              continue;
            }
            let current = if app
              .state::<super::startup::StartupState>()
              .interactive("main")
            {
              None
            } else {
              Some("main")
            };
            if let Err(error) = super::windows::open_target(&app, &path, current).await {
              log::warn!("Native document open failed: {}", error.code);
            }
          } else if url.scheme() == "marklab" {
            let _ = super::launch::publish(&app, url.as_str(), super::launch::Source::OpenUrl);
            if !super::windows::activate_existing(&app).unwrap_or(false)
              && super::startup::initialized(&app)
            {
              let _ = super::bootstrap::reopen(&app).await;
            }
          }
        }
      });
    }
    #[cfg(target_os = "macos")]
    RunEvent::Reopen {
      has_visible_windows,
      ..
    } if !has_visible_windows => {
      let app = app.clone();
      tauri::async_runtime::spawn(async move {
        if !super::windows::activate_existing(&app).unwrap_or(false) {
          let _ = super::bootstrap::reopen(&app).await;
        }
      });
    }
    _ => {}
  }
}
