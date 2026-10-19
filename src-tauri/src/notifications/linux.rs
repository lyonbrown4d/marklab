//! One lazy session-bus connection, with acknowledged show/close and shared signal tracking.
use super::{Event, EventHandler, NativeMessage};
use crate::error::{BackendError, BackendResult};
use futures_util::StreamExt;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::sync::{Mutex, OnceCell};
use zbus::{Connection, Proxy};
const DESTINATION: &str = "org.freedesktop.Notifications";
const PATH: &str = "/org/freedesktop/Notifications";
#[derive(Clone)]
struct Shown {
    server_id: u32,
    owner: String,
    token: String,
}
type ShownMap = Arc<Mutex<HashMap<String, Shown>>>;
struct Session {
    connection: Connection,
    listener: tokio::task::JoinHandle<()>,
    body_markup: bool,
}
impl Drop for Session {
    fn drop(&mut self) {
        self.listener.abort();
    }
}
pub(super) struct Backend {
    session: OnceCell<Session>,
    shown: ShownMap,
    events: EventHandler,
    desktop_entry: String,
}
impl Backend {
    pub fn new(app: &tauri::AppHandle, events: EventHandler) -> BackendResult<Self> {
        Ok(Self {
            session: OnceCell::new(),
            shown: Arc::new(Mutex::new(HashMap::new())),
            events,
            desktop_entry: app.config().identifier.clone(),
        })
    }
    pub async fn prepare(&self) -> BackendResult<()> {
        Ok(())
    }
    async fn session(&self) -> BackendResult<&Session> {
        self.session
            .get_or_try_init(|| async {
                let connection = tokio::time::timeout(
                    Duration::from_secs(10),
                    zbus::connection::Builder::session()
                        .method_timeout(Duration::from_secs(10))
                        .build(),
                )
                .await
                .map_err(|_| unavailable())?
                .map_err(bus_error)?;
                let proxy = Proxy::new_owned(connection.clone(), DESTINATION, PATH, DESTINATION)
                    .await
                    .map_err(bus_error)?;
                let capabilities: Vec<String> = proxy
                    .call("GetCapabilities", &())
                    .await
                    .map_err(bus_error)?;
                if !capabilities
                    .iter()
                    .any(|capability| capability == "actions")
                {
                    return Err(BackendError::new(
                        "NOTIFICATION_ACTION_UNSUPPORTED",
                        "The desktop notification server does not support click actions",
                    ));
                }
                let body_markup = capabilities.iter().any(|capability| capability == "body-markup");
                // Subscribe before sending: a quick user action must not race the tracking map.
                let mut signals = proxy.receive_all_signals().await.map_err(bus_error)?;
                let shown = self.shown.clone();
                let events = self.events.clone();
                let signal_connection = connection.clone();
                let listener = tokio::spawn(async move {
                    while let Some(signal) = signals.next().await {
                        let header = signal.header();
                        let Some(sender) = header.sender().map(|name| name.as_str().to_owned())
                        else {
                            continue;
                        };
                        let (server_id, activated) = match header
                            .member()
                            .map(|member| member.as_str())
                        {
                            Some("ActionInvoked") => {
                                let Ok((id, action)) = signal.body().deserialize::<(u32, String)>()
                                else {
                                    continue;
                                };
                                if action != "default" {
                                    continue;
                                }
                                (id, true)
                            }
                            Some("NotificationClosed") => {
                                let Ok((id, _reason)) = signal.body().deserialize::<(u32, u32)>()
                                else {
                                    continue;
                                };
                                (id, false)
                            }
                            _ => continue,
                        };
                        let entry = {
                            let mut shown = shown.lock().await;
                            let id = shown
                                .iter()
                                .find(|(_, entry)| {
                                    entry.server_id == server_id && entry.owner == sender
                                })
                                .map(|(id, _)| id.clone());
                            id.and_then(|id| if activated { shown.get(&id).cloned() } else { shown.remove(&id) })
                        };
                        if let Some(entry) = entry {
                            if activated {
                                events(Event::Activated(entry.token.clone()));
                                // ActionInvoked does not require servers to dismiss resident notifications.
                                let mut shown = shown.lock().await;
                                if !shown.values().any(|current| current.token == entry.token) {
                                    continue;
                                }
                                match close_native(&signal_connection, &entry.owner, entry.server_id).await {
                                    Ok(()) => shown.retain(|_, current| current.token != entry.token),
                                    Err(error) => log::warn!(target: "notifications", "notification cleanup failed code={}", error.code),
                                }
                            } else {
                                events(Event::Dismissed(entry.token));
                            }
                        }
                    }
                });
                Ok(Session {
                    connection,
                    listener,
                    body_markup,
                })
            })
            .await
    }
    pub async fn show(&self, message: &NativeMessage) -> BackendResult<()> {
        self.close(&message.id).await?;
        let session = self.session().await?;
        let bus = Proxy::new(
            &session.connection,
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            "org.freedesktop.DBus",
        )
        .await
        .map_err(bus_error)?;
        let owner: String = bus
            .call("GetNameOwner", &(DESTINATION,))
            .await
            .map_err(bus_error)?;
        // Pin this call to the unique daemon identity. Numeric ids may be reused after restart.
        let proxy = Proxy::new_owned(session.connection.clone(), owner.clone(), PATH, DESTINATION)
            .await
            .map_err(bus_error)?;
        let mut shown = self.shown.lock().await;
        if shown.len() >= 256 {
            return Err(BackendError::new(
                "NOTIFICATION_LIMIT",
                "Too many active notifications",
            ));
        }
        let server_id: u32 = proxy
            .call(
                "Notify",
                &notify_body(message, &self.desktop_entry, session.body_markup),
            )
            .await
            .map_err(bus_error)?;
        shown.insert(
            message.id.clone(),
            Shown {
                server_id,
                owner,
                token: message.token.clone(),
            },
        );
        Ok(())
    }
    pub async fn close(&self, id: &str) -> BackendResult<()> {
        let Some(session) = self.session.get() else {
            return Ok(());
        };
        let mut shown = self.shown.lock().await;
        if let Some(entry) = shown.get(id) {
            close_native(&session.connection, &entry.owner, entry.server_id).await?;
            let token = entry.token.clone();
            shown.remove(id);
            drop(shown);
            (self.events)(Event::Dismissed(token));
        }
        Ok(())
    }
}
async fn close_native(connection: &Connection, owner: &str, id: u32) -> BackendResult<()> {
    let proxy = Proxy::new(connection, owner, PATH, DESTINATION)
        .await
        .map_err(bus_error)?;
    match proxy.call::<_, _, ()>("CloseNotification", &(id,)).await {
        Ok(()) => Ok(()),
        Err(zbus::Error::MethodError(name, _, _))
            if matches!(
                name.as_str(),
                "org.freedesktop.DBus.Error.ServiceUnknown"
                    | "org.freedesktop.DBus.Error.NameHasNoOwner"
            ) =>
        {
            Ok(())
        }
        Err(error) => Err(bus_error(error)),
    }
}
fn escaped_body(body: &str) -> String {
    body.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
type NotifyBody<'a> = (
    &'static str,
    u32,
    &'static str,
    &'a str,
    String,
    Vec<&'static str>,
    HashMap<&'static str, zbus::Variant<'a>>,
    i32,
);
fn notify_body<'a>(
    message: &'a NativeMessage,
    desktop_entry: &'a str,
    body_markup: bool,
) -> NotifyBody<'a> {
    (
        "Marklab",
        0,
        "",
        &message.title,
        if body_markup {
            escaped_body(&message.body)
        } else {
            message.body.clone()
        },
        vec!["default", "Open Marklab"],
        HashMap::from([("desktop-entry", zbus::Variant::from(desktop_entry))]),
        -1,
    )
}
fn bus_error(_error: zbus::Error) -> BackendError {
    unavailable()
}
fn unavailable() -> BackendError {
    BackendError::new(
        "NOTIFICATION_DBUS_FAILED",
        "The desktop notification service is unavailable",
    )
}

#[cfg(test)]
#[path = "linux_tests.rs"]
mod tests;
