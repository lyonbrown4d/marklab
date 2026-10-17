#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    tauri::async_runtime::set(tokio::runtime::Handle::current());
    // Tauri's UI loop must stay on the process main thread. block_in_place keeps
    // that thread while allowing startup callbacks to await this shared runtime.
    tokio::task::block_in_place(marklab_desktop::run);
}
