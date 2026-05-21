use crate::commands::app::{app_get_platform, menu_dispatch};
use crate::commands::export::{export_markdown, export_open_output_path};
use crate::commands::fs::{
  fs_analyze_markdown_buffer, fs_create_dir, fs_create_file, fs_delete_path, fs_flush_buffers,
  fs_get_background_tasks, fs_get_buffer_status, fs_get_outline_graph, fs_get_path_metadata,
  fs_get_root_info, fs_get_snapshot, fs_get_workspace_graph, fs_get_workspace_index,
  fs_import_markdown_asset, fs_import_markdown_asset_base64, fs_list_entries, fs_move_path,
  fs_open_file, fs_open_path_in_system, fs_read_file, fs_rebuild_search_index, fs_rename_path,
  fs_resolve_markdown_asset, fs_search_workspace, fs_set_root, fs_set_single_file,
  fs_update_buffer, fs_write_file,
};
use crate::commands::git::{
  git_commit_all, git_discover_repo, git_get_file_diff, git_get_status, git_init_repo,
};
use crate::commands::markdown::{list_markdown_files, read_markdown_file, write_markdown_file};
use crate::commands::terminal::{terminal_close, terminal_create, terminal_resize, terminal_write};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::{atomic::AtomicBool, atomic::Ordering, Arc, Mutex, RwLock};
use tauri::{Emitter, Listener, Manager};

mod commands;
mod models;
mod services;
mod state;

use crate::state::{
  AllowedSystemPathsState, BackgroundTasksState, FsState, FsStateData, FsWatcherState,
};

fn run_impl() {
  let app_container = futures::executor::block_on(services::di::build_app_container())
    .expect("failed to bootstrap application services");
  let app_services = app_container.services;
  let app_lifecycle = app_container.lifecycle;

  let builder = tauri::Builder::default();

  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  let builder = builder.plugin(tauri_plugin_cli::init());

  let builder = builder
    .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
      if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
      }
      let _ = app.emit(
        "single-instance",
        serde_json::json!({
          "args": args,
          "cwd": cwd,
        }),
      );
    }))
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_macos_fps::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_os::init())
    .manage(app_services)
    .manage(app_lifecycle)
    .manage(FsState(RwLock::new(FsStateData {
      root_kind: "internal".to_string(),
      root_path: PathBuf::new(),
      internal_root: PathBuf::new(),
      single_file: None,
    })))
    .manage(FsWatcherState(Mutex::new(None)))
    .manage(BackgroundTasksState(Mutex::new(HashMap::new())))
    .manage(AllowedSystemPathsState(Mutex::new(HashSet::new())));

  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  let builder = builder.plugin(
    tauri_plugin_window_state::Builder::default()
      .with_denylist(&["splashscreen"])
      .with_state_flags(
        tauri_plugin_window_state::StateFlags::SIZE
          | tauri_plugin_window_state::StateFlags::POSITION
          | tauri_plugin_window_state::StateFlags::MAXIMIZED,
      )
      .build(),
  );

  builder
    .setup(|app| {
      let app_handle = app.handle();
      commands::app::setup_native_menu(app_handle)?;
      let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data dir")?;
      let internal_root = app_data_dir.join("marko").join("workspace");
      fs::create_dir_all(&internal_root)?;
      commands::fs::ensure_default_file(&internal_root)?;

      if let Some(state) = app_handle.try_state::<FsState>() {
        let mut data = state.0.write().map_err(|_| "Failed to lock fs state")?;
        data.root_kind = "internal".to_string();
        data.root_path = internal_root.clone();
        data.internal_root = internal_root;
      }
      if let (Some(state), Some(watcher_state)) = (
        app_handle.try_state::<FsState>(),
        app_handle.try_state::<FsWatcherState>(),
      ) {
        commands::fs::start_fs_watcher(app_handle, &state, &watcher_state)?;
      }
      commands::fs::start_buffer_flush_worker(app_handle);
      if let Some(services) = app_handle.try_state::<services::AppServices>() {
        services.runtime.start_event_worker(app_handle);
        if let Err(err) = services.runtime.publish_initial_workspace_event() {
          log::warn!("publish initial workspace event failed: {err}");
        }
      }

      if let (Some(splash), Some(main)) = (
        app_handle.get_webview_window("splashscreen"),
        app_handle.get_webview_window("main"),
      ) {
        // On macOS, WKWebView suspends JavaScript when the window is hidden.
        // Show the main window (splash has alwaysOnTop so stays on top) so the
        // WebView can load; otherwise app-ready is never emitted.
        #[cfg(target_os = "macos")]
        {
          let _ = main.show();
        }

        let splash_done = Arc::new(AtomicBool::new(false));
        let splash_done_clone = Arc::clone(&splash_done);

        app_handle.listen("app-ready", move |_| {
          if splash_done_clone
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
          {
            let _ = main.show();
            let _ = main.set_focus();
            let _ = splash.close();
          }
        });

        // Fallback: if app-ready is never received (e.g. WebView fails to load),
        // close splash and show main after 5 seconds.
        let app_handle_timeout = app_handle.clone();
        tauri::async_runtime::spawn(async move {
          tokio::time::sleep(std::time::Duration::from_secs(5)).await;
          if splash_done
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
          {
            if let (Some(splash), Some(main)) = (
              app_handle_timeout.get_webview_window("splashscreen"),
              app_handle_timeout.get_webview_window("main"),
            ) {
              let _ = main.show();
              let _ = main.set_focus();
              let _ = splash.close();
            }
          }
        });
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .on_menu_event(|app, event| {
      let id = event.id().as_ref().to_string();
      let forward = matches!(
        id.as_str(),
        "file.new"
          | "file.open_project"
          | "file.open_file"
          | "file.export_pdf"
          | "file.export_docx"
          | "file.export_html"
          | "view.wysiwyg"
          | "view.source"
          | "view.graph"
          | "view.toggle_sidebar"
          | "view.toggle_right_sidebar"
          | "theme.light"
          | "theme.dark"
          | "theme.marko-light"
          | "theme.marko-dark"
          | "help.about"
      );
      if forward {
        let _ = app.emit("menu-action", id);
      }
    })
    .on_window_event(|window, event| {
      if window.label() == "main" && matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
        let app = window.app_handle();
        if let (Some(state), Some(services)) = (
          app.try_state::<FsState>(),
          app.try_state::<services::AppServices>(),
        ) {
          let _ = commands::fs::flush_all_buffers(&state, &services);
        }
        if let Some(lifecycle) = app.try_state::<services::di::AppLifecycle>() {
          if let Err(err) = lifecycle.shutdown_blocking() {
            log::warn!("application lifecycle shutdown failed: {err}");
          }
        }
      }
    })
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      list_markdown_files,
      read_markdown_file,
      write_markdown_file,
      fs_get_root_info,
      fs_get_snapshot,
      fs_set_root,
      fs_set_single_file,
      fs_list_entries,
      fs_read_file,
      fs_get_workspace_index,
      fs_get_workspace_graph,
      fs_get_outline_graph,
      fs_analyze_markdown_buffer,
      fs_search_workspace,
      fs_rebuild_search_index,
      fs_open_file,
      fs_update_buffer,
      fs_flush_buffers,
      fs_get_buffer_status,
      fs_get_background_tasks,
      fs_get_path_metadata,
      fs_open_path_in_system,
      fs_import_markdown_asset,
      fs_import_markdown_asset_base64,
      fs_resolve_markdown_asset,
      fs_write_file,
      fs_create_file,
      fs_create_dir,
      fs_delete_path,
      fs_rename_path,
      fs_move_path,
      app_get_platform,
      menu_dispatch,
      git_discover_repo,
      git_init_repo,
      git_get_status,
      git_get_file_diff,
      git_commit_all,
      export_markdown,
      export_open_output_path,
      terminal_create,
      terminal_write,
      terminal_resize,
      terminal_close
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  run_impl();
}

pub async fn run_async() {
  run_impl();
}
