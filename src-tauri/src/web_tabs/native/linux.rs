use super::*;
use gtk::prelude::*;
use webkit2gtk::prelude::*;

pub async fn action(view: &Webview, action: &'static str) -> BackendResult<()> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        let webview = platform.inner();
        match action {
            "back" => webview.go_back(),
            "forward" => webview.go_forward(),
            "reload" => webview.reload(),
            "stop" => webview.stop_loading(),
            _ => {}
        }
        let _ = sender.send(());
    })?;
    receiver
        .await
        .map_err(|_| failure("Native web tab action was cancelled"))?;
    Ok(())
}
pub fn refresh(manager: WebTabs, window: TrustedWindow, id: String, view: &Webview) {
    let _ = view.with_webview(move |platform| {
        let webview = platform.inner();
        manager.change(&window, &id, |entry| {
            entry.state.can_go_back = webview.can_go_back();
            entry.state.can_go_forward = webview.can_go_forward();
        });
    });
}
pub async fn install_monitor(
    manager: WebTabs,
    window: TrustedWindow,
    id: String,
    view: &Webview,
    _focused: std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> BackendResult<Option<usize>> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        let token = platform.inner().connect_key_press_event(move |_, event| {
            let key = event.keyval();
            let name = key
                .to_unicode()
                .map(|key| key.to_lowercase().collect::<String>())
                .or_else(|| key.name().map(|name| name.to_string().to_lowercase()));
            let Some(key) = name else {
                return gtk::glib::Propagation::Proceed;
            };
            let flags = event.state();
            let modifiers = shortcuts::Modifiers {
                alt: flags.contains(gtk::gdk::ModifierType::MOD1_MASK),
                control: flags.contains(gtk::gdk::ModifierType::CONTROL_MASK),
                meta: flags.intersects(
                    gtk::gdk::ModifierType::META_MASK | gtk::gdk::ModifierType::SUPER_MASK,
                ),
                shift: flags.contains(gtk::gdk::ModifierType::SHIFT_MASK),
            };
            if manager.shortcut(&window, &id, &shortcuts::normalize_key(&key), modifiers) {
                gtk::glib::Propagation::Stop
            } else {
                gtk::glib::Propagation::Proceed
            }
        });
        // Signal IDs are opaque and !Clone; keep ownership until disconnected on
        // the same UI thread. The pointer never crosses into renderer IPC.
        let token = Box::into_raw(Box::new(token)) as usize;
        let _ = sender.send(Some(token));
    })?;
    receiver
        .await
        .map_err(|_| failure("Native shortcut installation was cancelled"))
}
pub fn remove_monitor(view: &Webview, token: Option<usize>) {
    if let Some(token) = token {
        let _ = view.with_webview(move |platform| {
            // SAFETY: install_monitor allocated exactly one SignalHandlerId here;
            // Entry ownership releases it once, on the owning GTK main thread.
            let token = unsafe { Box::from_raw(token as *mut gtk::glib::SignalHandlerId) };
            platform.inner().disconnect(*token);
        });
    }
}

pub async fn focused(
    view: &Webview,
    _focused: std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> BackendResult<bool> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |platform| {
        let webview = platform.inner();
        let _ = sender.send(webview.has_focus() && webview.is_visible());
    })?;
    receiver
        .await
        .map_err(|_| failure("Native web tab focus query was cancelled"))
}
