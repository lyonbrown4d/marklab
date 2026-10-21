mod bootstrap;
mod cli;
#[cfg(feature = "ipc-codegen")]
mod codegen;
pub mod commands;
mod controls;
mod diagnostics;
pub(crate) mod event_contracts;
mod events;
mod flush;
mod geometry;
mod invoke;
mod launch;
mod lifecycle;
mod log_redaction;
pub(crate) mod logging;
mod menu_sections;
mod menus;
mod native_edit;
mod policy;
mod protocol;
mod startup;
mod transitions;
mod visibility;
mod window_state;
pub mod windows;
use crate::error::BackendResult;
pub(crate) use flush::with_flushed_windows;
use tauri::Manager;
pub fn run() -> BackendResult<()> {
  let builder = tauri::Builder::default()
    .manage(startup::StartupState::default())
    .manage(launch::LaunchState::default())
    .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
      let callback_app = app.clone();
      // Dispatch native window operations onto the main thread.
      let dispatched = app.run_on_main_thread(move || {
        let app = callback_app;
        tauri::async_runtime::spawn(async move {
          let paths =
            match cli::prepare_forwarded(&app, args.clone(), std::path::Path::new(&cwd)).await {
              Ok(cli::Outcome::Open(paths)) => paths,
              Ok(cli::Outcome::Output(output)) => {
                println!("{output}");
                return;
              }
              Err(error) => {
                cli::report_forward_error(&app, &error);
                return;
              }
            };
          for argument in &args {
            let _ = launch::publish(&app, argument, launch::Source::SecondInstance);
          }
          if app
            .state::<startup::StartupState>()
            .queue_native(&paths)
            .unwrap_or(true)
          {
            return;
          }
          if paths.is_empty() {
            if let Some(window) = menus::focused(&app) {
              let _ = window.unminimize();
              let _ = window.show();
              let _ = window.set_focus();
              let _ = crate::desktop::event_contracts::SINGLE_INSTANCE.emit_to(
                window.app_handle(),
                tauri::EventTarget::webview_window(window.label()),
                &(crate::desktop::event_contracts::SingleInstance { args, cwd }),
              );
            } else if !windows::activate_existing(&app).unwrap_or(false) {
              let _ = bootstrap::reopen(&app).await;
            }
          } else {
            for (index, path) in paths.into_iter().enumerate() {
              let current =
                if index == 0 && !app.state::<startup::StartupState>().interactive("main") {
                  Some("main")
                } else {
                  None
                };
              if let Err(error) = windows::open_target(&app, &path, current).await {
                log::warn!("Native path open failed: {}", error.code);
              }
            }
          }
        });
      });
      if let Err(error) = dispatched {
        log::warn!("Could not dispatch forwarded command line: {error}");
      }
    }))
    .plugin(tauri_plugin_cli::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(logging::builder()?.build())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .register_asynchronous_uri_scheme_protocol("marklab-asset", protocol::serve)
    .setup(|app| {
      logging::install_panic_hook();
      app.manage(crate::native_window::NativeWindows::default());
      match crate::notifications::DesktopNotifications::new(app.handle()) {
        Ok(notifications) => {
          app.manage(notifications);
        }
        Err(error) => log::warn!("Native notifications unavailable: {}", error.code),
      }
      for argument in std::env::args().skip(1) {
        launch::publish(app.handle(), &argument, launch::Source::Startup)?;
      }
      app.manage(geometry::GeometryState::default());
      app.manage(lifecycle::QuitState::default());
      app.manage(lifecycle::LifecycleGate::default());
      app.manage(lifecycle::FlushState::default());
      app.manage(controls::VimOwnership::default());
      app.manage(diagnostics::Diagnostics::default());
      app.manage(menus::MenuState::default());
      app.manage(visibility::Visibility::default());
      app.state::<startup::StartupState>().begin("main", None)?;
      windows::create_splash(app.handle())?;
      bootstrap::start(app.handle());
      Ok(())
    })
    .on_window_event(lifecycle::window_event)
    .on_menu_event(|app, event| {
      if let Err(error) = menus::dispatch(app, event.id().as_ref()) {
        log::warn!("Native menu action failed: {}", error.code);
      }
    })
    .invoke_handler(invoke::handler());
  #[cfg(target_os = "macos")]
  let builder = builder.plugin(tauri_plugin_macos_fps::init());
  #[cfg(all(feature = "e2e-testing", debug_assertions))]
  let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());
  let app = builder.build(tauri::generate_context!())?;
  let arguments = std::env::args().collect();
  let outcome = tauri::async_runtime::block_on(async {
    let cwd = std::env::current_dir()?;
    cli::prepare(app.handle(), arguments, &cwd).await
  });
  match outcome {
    Ok(cli::Outcome::Open(paths)) => {
      app.manage(cli::LaunchArguments(paths));
    }
    Ok(cli::Outcome::Output(output)) => {
      println!("{output}");
      tauri_plugin_single_instance::destroy(&app);
      return Ok(());
    }
    Err(error) => {
      tauri_plugin_single_instance::destroy(&app);
      return Err(error);
    }
  }
  app.run(lifecycle::run_event);
  Ok(())
}

pub(crate) async fn reset_workspace_runtime(
  window: &crate::native_window::TrustedWindow,
) -> BackendResult<()> {
  lifecycle::cleanup_window(window.app_handle(), window.label()).await?;
  window
    .state::<crate::terminal::TerminalState>()
    .reopen_window(window.label())
}
pub(crate) async fn lifecycle_guard(app: &tauri::AppHandle) -> tokio::sync::OwnedMutexGuard<()> {
  app
    .state::<lifecycle::LifecycleGate>()
    .0
    .clone()
    .lock_owned()
    .await
}

pub(crate) async fn fail_workspace_transition(
  window: &crate::native_window::TrustedWindow,
  error: &crate::error::BackendError,
) -> BackendResult<()> {
  let root = window
    .state::<crate::workspace::WorkspaceRegistry>()
    .get(window.label())?
    .root_info();
  window
    .state::<startup::StartupState>()
    .begin(window.label(), Some(root.path))?;
  window.hide()?;
  startup::failed(window.app_handle(), window.label(), error.message.clone()).await
}

#[cfg(feature = "ipc-codegen")]
pub(crate) use invoke::export as export_bindings;
