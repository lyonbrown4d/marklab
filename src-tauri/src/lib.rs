pub mod ai;
pub mod analysis;
pub mod assets;
pub mod blocking;
pub mod database;
pub mod error;
pub mod export;
pub mod git;
pub mod graph_layout;
pub mod history;
pub mod language;
pub mod link_preview;
pub mod native_window;
pub mod platform;
pub mod settings;
pub mod sync;
pub mod terminal;
pub mod web_tabs;
pub mod workspace;

pub fn run() {
    if let Err(error) = desktop::run() {
        eprintln!("Marklab could not start: {error}");
        std::process::exit(1);
    }
}

mod desktop;
