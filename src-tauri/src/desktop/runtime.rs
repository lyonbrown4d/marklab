//! Select exactly one browser engine per platform. Test automation is absent
//! from normal builds, including release binaries with arbitrary environment.
use crate::error::BackendResult;

pub(super) fn builder() -> BackendResult<tauri::Builder> {
  #[cfg(target_os = "windows")]
  let builder = tauri::Builder::default().runtime(tauri_runtime_wry::Wry::default());
  #[cfg(not(target_os = "windows"))]
  let builder = {
    let runtime = tauri_runtime_cef::Cef::default()
      .sandbox(tauri_runtime_cef::SandboxPolicy::Required)
      // Application flags such as --version belong to our CLI, including in
      // debug builds. Browser switches come only from this typed runtime setup.
      .with_settings(|settings| settings.command_line_args_disabled = 1);
    // CEF's release policy already restores validated scheme URLs. Its debug
    // policy assumes inherited browser flags are enabled, so restore ours here.
    #[cfg(debug_assertions)]
    let runtime = std::env::args()
      .skip(1)
      .filter_map(|argument| super::launch::normalize(&argument))
      .fold(runtime, |runtime, url| {
        runtime.command_line_arg(url, None::<String>)
      });
    #[cfg(all(feature = "e2e-testing", debug_assertions))]
    let runtime = {
      let port = std::env::var("MARKLAB_E2E_DRIVER_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|port| *port >= 1024)
        .ok_or_else(|| {
          crate::error::BackendError::new(
            "E2E_DRIVER_PORT",
            "Native tests require MARKLAB_E2E_DRIVER_PORT in 1024..65535",
          )
        })?;
      let paths = tauri::async_runtime::block_on(crate::composition::AppPaths::isolated(
        std::env::var_os("MARKLAB_E2E_DATA_DIR").map(std::path::PathBuf::from),
        std::env::var_os("MARKLAB_E2E_CACHE_DIR").map(std::path::PathBuf::from),
      ))?;
      runtime
        .root_cache_path(paths.cache_dir.join("cef"))
        .remote_debugging(tauri_runtime_cef::RemoteDebugging::Port {
          port,
          allowed_origins: Vec::new(),
        })
    };
    tauri::Builder::default().runtime(runtime)
  };
  Ok(builder)
}
