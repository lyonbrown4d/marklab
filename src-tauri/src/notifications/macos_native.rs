use super::{
    NativeMessage,
    delegate::{Delegate, Tokens},
};
use crate::error::{BackendError, BackendResult};
use block2::RcBlock;
use objc2::{
    rc::Retained,
    runtime::{Bool, ProtocolObject},
};
use objc2_foundation::{NSArray, NSBundle, NSError, NSSet, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNMutableNotificationContent, UNNotificationCategory,
    UNNotificationCategoryOptions, UNNotificationRequest, UNNotificationSound,
    UNUserNotificationCenter,
};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

const CATEGORY: &str = "marklab.task-result";
type Reply = Arc<Mutex<Option<tokio::sync::oneshot::Sender<BackendResult<()>>>>>;

fn center() -> BackendResult<Retained<UNUserNotificationCenter>> {
    let bundle = NSBundle::mainBundle();
    if bundle
        .bundleIdentifier()
        .is_none_or(|id| id.to_string().is_empty())
        || !bundle.bundlePath().to_string().ends_with(".app")
    {
        // UNUserNotificationCenter can raise an Objective-C exception for an
        // unbundled dev executable. Never call it without an application identity.
        return Err(BackendError::new(
            "NOTIFICATION_UNAVAILABLE",
            "Native notifications require an application bundle",
        ));
    }
    Ok(UNUserNotificationCenter::currentNotificationCenter())
}

pub(super) async fn authorize(
    app: &tauri::AppHandle,
    delegate: Retained<Delegate>,
) -> BackendResult<()> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let reply = Arc::new(Mutex::new(Some(sender)));
    app.run_on_main_thread(move || {
        let result = (|| {
            let center = center()?;
            center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            let category =
                UNNotificationCategory::categoryWithIdentifier_actions_intentIdentifiers_options(
                    &NSString::from_str(CATEGORY),
                    &NSArray::new(),
                    &NSArray::new(),
                    UNNotificationCategoryOptions::CustomDismissAction,
                );
            center.setNotificationCategories(&NSSet::from_retained_slice(&[category]));
            let callback_reply = reply.clone();
            let callback = RcBlock::new(move |granted: Bool, error: *mut NSError| {
                let result = if !error.is_null() {
                    Err(os_error(error, "NOTIFICATION_PERMISSION_FAILED"))
                } else if granted.as_bool() {
                    Ok(())
                } else {
                    Err(BackendError::new(
                        "NOTIFICATION_PERMISSION_DENIED",
                        "Notification permission was denied",
                    ))
                };
                complete(&callback_reply, result);
            });
            center.requestAuthorizationWithOptions_completionHandler(
                UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
                &callback,
            );
            Ok(())
        })();
        if let Err(error) = result {
            complete(&reply, Err(error));
        }
    })?;
    receive(receiver, Duration::from_secs(120)).await
}

pub(super) async fn show(
    app: &tauri::AppHandle,
    message: &NativeMessage,
    tokens: Arc<Tokens>,
) -> BackendResult<()> {
    let id = message.token.clone();
    let title = message.title.clone();
    let body = message.body.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let reply = Arc::new(Mutex::new(Some(sender)));
    app.run_on_main_thread(move || {
        let result = (|| {
            if !tokens.contains(&id) {
                return Err(BackendError::new(
                    "NOTIFICATION_CANCELLED",
                    "Notification was cancelled before delivery",
                ));
            }
            let center = center()?;
            let content = UNMutableNotificationContent::new();
            content.setTitle(&NSString::from_str(&title));
            content.setBody(&NSString::from_str(&body));
            content.setCategoryIdentifier(&NSString::from_str(CATEGORY));
            content.setSound(Some(&UNNotificationSound::defaultSound()));
            let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
                &NSString::from_str(&id),
                &content,
                None,
            );
            let callback_reply = reply.clone();
            let callback = RcBlock::new(move |error: *mut NSError| {
                complete(
                    &callback_reply,
                    if error.is_null() {
                        Ok(())
                    } else {
                        Err(os_error(error, "NOTIFICATION_DELIVERY_FAILED"))
                    },
                );
            });
            center.addNotificationRequest_withCompletionHandler(&request, Some(&callback));
            Ok(())
        })();
        if let Err(error) = result {
            complete(&reply, Err(error));
        }
    })?;
    receive(receiver, Duration::from_secs(15)).await
}

pub(super) async fn remove(app: &tauri::AppHandle, token: String) -> BackendResult<()> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let result = center().map(|center| {
            let identifiers = NSArray::from_retained_slice(&[NSString::from_str(&token)]);
            center.removePendingNotificationRequestsWithIdentifiers(&identifiers);
            center.removeDeliveredNotificationsWithIdentifiers(&identifiers);
        });
        let _ = sender.send(result);
    })?;
    receive(receiver, Duration::from_secs(15)).await
}

fn complete(reply: &Reply, result: BackendResult<()>) {
    if let Ok(mut pending) = reply.lock()
        && let Some(sender) = pending.take()
    {
        let _ = sender.send(result);
    }
}

fn os_error(error: *mut NSError, code: &str) -> BackendError {
    // SAFETY: Apple provides a live NSError (or nil) for the callback duration;
    // only its numeric code is copied, never native pointers or secret text.
    match unsafe { error.as_ref() } {
        Some(error) => BackendError::new(
            code,
            format!("Native notification request failed ({})", error.code()),
        ),
        None => BackendError::new(code, "Native notification request failed"),
    }
}

async fn receive(
    receiver: tokio::sync::oneshot::Receiver<BackendResult<()>>,
    timeout: Duration,
) -> BackendResult<()> {
    tokio::time::timeout(timeout, receiver)
        .await
        .map_err(|_| {
            BackendError::new(
                "NOTIFICATION_TIMEOUT",
                "Native notification request timed out",
            )
        })?
        .map_err(|_| {
            BackendError::new(
                "NOTIFICATION_CANCELLED",
                "Native notification request was cancelled",
            )
        })?
}
