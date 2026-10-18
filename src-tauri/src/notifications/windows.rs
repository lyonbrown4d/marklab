use crate::error::{BackendError, BackendResult};
use tokio::sync::{mpsc, oneshot};

#[path = "windows_activation.rs"]
mod activation;
#[path = "windows_entry.rs"]
mod entry;
#[path = "windows_identity.rs"]
mod identity;
#[path = "windows_toasts.rs"]
mod toasts;

use super::{EventHandler, NativeMessage};

pub(super) struct Backend {
    identity: String,
    events: EventHandler,
    sender: tokio::sync::OnceCell<mpsc::Sender<Command>>,
}
enum Command {
    Show(NativeMessage, oneshot::Sender<BackendResult<()>>),
    Close(String, oneshot::Sender<BackendResult<()>>),
    Forget(String),
}
impl Backend {
    pub fn new(app: &tauri::AppHandle, events: EventHandler) -> BackendResult<Self> {
        Ok(Self {
            identity: app.config().identifier.clone(),
            events,
            sender: tokio::sync::OnceCell::new(),
        })
    }
    fn start_worker(&self) -> BackendResult<mpsc::Sender<Command>> {
        let identity = self.identity.clone();
        let events = self.events.clone();
        let (sender, mut receiver) = mpsc::channel::<Command>(32);
        let weak = sender.downgrade();
        std::thread::Builder::new()
            .name("marklab-toast-com".into())
            .spawn(move || {
                // WinRT objects and the running COM class stay on one initialized
                // MTA thread. Shortcut filesystem work never blocks the GUI/Tokio.
                let mut state = None;
                while let Some(command) = receiver.blocking_recv() {
                    match command {
                        Command::Show(message, reply) => {
                            // A transient COM/shortcut failure belongs to this
                            // request; a later eligible notification may retry.
                            if state.is_none() {
                                match toasts::State::new(
                                    identity.clone(),
                                    events.clone(),
                                    weak.clone(),
                                ) {
                                    Ok(initialized) => state = Some(initialized),
                                    Err(error) => {
                                        let _ = reply.send(Err(error));
                                        continue;
                                    }
                                }
                            }
                            let result = match state.as_mut() {
                                Some(state) => state.show(&message),
                                None => Err(unavailable("Windows notifications are unavailable")),
                            };
                            let _ = reply.send(result);
                        }
                        Command::Close(id, reply) => {
                            let result = match state.as_mut() {
                                Some(state) => state.close(&id),
                                None => Ok(()),
                            };
                            let _ = reply.send(result);
                        }
                        Command::Forget(token) => {
                            if let Some(state) = &mut state {
                                state.forget(&token);
                            }
                        }
                    }
                }
            })?;
        Ok(sender)
    }
    pub async fn prepare(&self) -> BackendResult<()> {
        Ok(())
    }
    pub async fn show(&self, message: &NativeMessage) -> BackendResult<()> {
        let message = NativeMessage {
            id: message.id.clone(),
            token: message.token.clone(),
            title: message.title.clone(),
            body: message.body.clone(),
        };
        let sender = self
            .sender
            .get_or_try_init(|| async { self.start_worker() })
            .await?;
        Self::run(sender, |reply| Command::Show(message, reply)).await
    }
    pub async fn close(&self, id: &str) -> BackendResult<()> {
        let Some(sender) = self.sender.get() else {
            return Ok(());
        };
        Self::run(sender, |reply| Command::Close(id.into(), reply)).await
    }
    async fn run(
        sender: &mpsc::Sender<Command>,
        command: impl FnOnce(oneshot::Sender<BackendResult<()>>) -> Command,
    ) -> BackendResult<()> {
        let (reply, receive) = oneshot::channel();
        sender
            .send(command(reply))
            .await
            .map_err(|_| unavailable("Windows notification worker stopped"))?;
        receive
            .await
            .map_err(|_| unavailable("Windows notification worker stopped"))?
    }
}
fn unavailable(message: &str) -> BackendError {
    BackendError::new("NOTIFICATION_UNAVAILABLE", message)
}
fn native_error(error: windows::core::Error) -> BackendError {
    BackendError::new("NOTIFICATION_ERROR", error.to_string())
}
fn forget(sender: &mpsc::WeakSender<Command>, token: &str) {
    if let Some(sender) = sender.upgrade() {
        // Cleanup is best effort if the bounded command queue is currently full;
        // the native keep-alive map itself is also capped at 256 notifications.
        let _ = sender.try_send(Command::Forget(token.into()));
    }
}
