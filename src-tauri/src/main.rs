#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg_attr(not(target_os = "windows"), tauri_runtime_cef::cef_entry_point)]
fn main() {
  // CEF handles renderer/GPU helpers before Tokio creates any worker threads.
  run();
}

#[tokio::main(flavor = "multi_thread")]
async fn run() {
  let mut arguments = std::env::args_os().skip(1);
  if arguments.next().as_deref() == Some(std::ffi::OsStr::new("mcp")) {
    if let Err(error) = marklab_desktop::mcp::run(arguments).await {
      // Never initialize desktop logging: stdout belongs solely to MCP.
      eprintln!("marklab-mcp failed [{}]: {}", error.code, error.message);
      std::process::exit(1);
    }
    return;
  }
  tauri::async_runtime::set(tokio::runtime::Handle::current());
  // Tauri's UI loop must stay on the process main thread. block_in_place keeps
  // that thread while allowing startup callbacks to await this shared runtime.
  tokio::task::block_in_place(marklab_desktop::run);
}
