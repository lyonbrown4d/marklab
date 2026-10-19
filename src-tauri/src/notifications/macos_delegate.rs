use super::super::{Event, EventHandler};
use crate::error::{BackendError, BackendResult};
use block2::DynBlock;
use objc2::{AnyThread, DefinedClass, define_class, msg_send, rc::Retained};
use objc2_foundation::{NSObject, NSObjectProtocol};
use objc2_user_notifications::{
  UNNotification, UNNotificationDefaultActionIdentifier, UNNotificationDismissActionIdentifier,
  UNNotificationPresentationOptions, UNNotificationResponse, UNUserNotificationCenter,
  UNUserNotificationCenterDelegate,
};
use std::{
  collections::HashMap,
  sync::{Arc, Mutex},
};

#[derive(Default)]
pub(super) struct Tokens(Mutex<HashMap<String, String>>);

impl Tokens {
  pub fn replace(&self, id: &str, token: &str) -> BackendResult<Option<String>> {
    let mut tokens = self.0.lock().map_err(|_| unavailable())?;
    // Service bounds active entries to 256. Keep this OS bookkeeping bounded
    // independently if a future caller bypasses that service contract.
    if tokens.len() >= 256 && !tokens.contains_key(id) {
      return Err(BackendError::new(
        "NOTIFICATION_LIMIT",
        "Too many active notifications",
      ));
    }
    Ok(tokens.insert(id.into(), token.into()))
  }
  pub fn get(&self, id: &str) -> BackendResult<Option<String>> {
    Ok(self.0.lock().map_err(|_| unavailable())?.get(id).cloned())
  }
  pub fn contains(&self, token: &str) -> bool {
    self
      .0
      .lock()
      .is_ok_and(|tokens| tokens.values().any(|value| value == token))
  }
  pub fn take(&self, token: &str) -> bool {
    let Ok(mut tokens) = self.0.lock() else {
      return false;
    };
    let Some(id) = tokens
      .iter()
      .find(|(_, value)| value.as_str() == token)
      .map(|(id, _)| id.clone())
    else {
      return false;
    };
    tokens.remove(&id).is_some()
  }
}

fn unavailable() -> BackendError {
  BackendError::new(
    "NOTIFICATION_UNAVAILABLE",
    "Notification state is unavailable",
  )
}

pub(super) struct Ivars {
  tokens: Arc<Tokens>,
  events: EventHandler,
}

define_class!(
  // SAFETY: NSObject has no subclassing invariants; all ivars are thread-safe
  // Rust values, and no AppKit/UI object is stored in the delegate.
  #[unsafe(super = NSObject)]
  #[name = "MarklabDesktopNotificationDelegate"]
  #[ivars = Ivars]
  pub(super) struct Delegate;

  unsafe impl NSObjectProtocol for Delegate {}

  unsafe impl UNUserNotificationCenterDelegate for Delegate {
    #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
    fn will_present(
      &self,
      _center: &UNUserNotificationCenter,
      notification: &UNNotification,
      completion: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
    ) {
      let token = notification.request().identifier().to_string();
      // Eligibility, including background-only, belongs to the service.
      // An unrelated or already closed request must not be presented.
      let options = if self.ivars().tokens.contains(&token) {
        UNNotificationPresentationOptions::Banner
          | UNNotificationPresentationOptions::List
          | UNNotificationPresentationOptions::Sound
      } else {
        UNNotificationPresentationOptions(0)
      };
      completion.call((options,));
    }

    #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
    fn did_receive(
      &self,
      _center: &UNUserNotificationCenter,
      response: &UNNotificationResponse,
      completion: &DynBlock<dyn Fn()>,
    ) {
      let token = response.notification().request().identifier().to_string();
      let action = response.actionIdentifier();
      // SAFETY: These framework constants are immutable NSString objects.
      let event = unsafe {
        if &*action == UNNotificationDefaultActionIdentifier {
          Some(Event::Activated(token.clone()))
        } else if &*action == UNNotificationDismissActionIdentifier {
          Some(Event::Dismissed(token.clone()))
        } else {
          None
        }
      };
      let accepted = event.is_some() && self.ivars().tokens.take(&token);
      completion.call(());
      if accepted && let Some(event) = event {
        // Rust panics must never unwind across the Objective-C callback.
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
          (self.ivars().events)(event)
        }));
      }
    }
  }
);

// SAFETY: NSObject retain/release is thread-safe. Delegate contains only
// Arc<Mutex<_>> and an explicitly Send+Sync callback; callbacks use those ivars
// exclusively. Native notification center/content objects never cross threads.
unsafe impl Send for Delegate {}
unsafe impl Sync for Delegate {}

impl Delegate {
  pub fn new(tokens: Arc<Tokens>, events: EventHandler) -> Retained<Self> {
    let object = Self::alloc().set_ivars(Ivars { tokens, events });
    // SAFETY: NSObject's init has this signature and no extra invariants.
    unsafe { msg_send![super(object), init] }
  }
}

#[cfg(test)]
#[path = "macos_tests.rs"]
mod tests;
