use super::{Action, Request};
use tauri_plugin_opener::OpenerExt;

pub(super) async fn run(app: &tauri::AppHandle, request: Request) {
    let owner = request.owner_window;
    let category = request.category.name();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    if app.run_on_main_thread(move || {
        if let Some(owner) = owner
            && owner.unminimize().and_then(|_| owner.show()).and_then(|_| owner.set_focus()).is_err()
        {
            log::warn!(target: "notifications", "notification action failed category={category} operation=focus_owner");
        }
        let _ = sender.send(());
    }).is_err() {
        log::warn!(target: "notifications", "notification action failed category={category} operation=schedule_focus");
    } else if receiver.await.is_err() {
        log::warn!(target: "notifications", "notification action failed category={category} operation=focus_owner");
    }
    if let Action::RevealExport(output) = request.action {
        let app = app.clone();
        let result = crate::blocking::run(move || {
            app.opener().reveal_item_in_dir(output).map_err(|_| {
                crate::error::BackendError::new(
                    "NOTIFICATION_ACTION_FAILED",
                    "Could not reveal exported file",
                )
            })
        })
        .await;
        if result.is_err() {
            log::warn!(target: "notifications", "notification action failed category=export operation=reveal_output");
        }
    }
}
