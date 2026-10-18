use super::{
    Command, EventHandler, NativeMessage,
    activation::Registration,
    entry::Entry,
    identity::{self, Identity},
    native_error,
};
use crate::error::{BackendError, BackendResult};
use std::collections::{HashMap, VecDeque};
use tokio::sync::mpsc;
use windows::{
    UI::Notifications::{NotificationSetting, ToastNotificationManager, ToastNotifier},
    Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize},
    core::HSTRING,
};

pub(super) struct State {
    notifier: ToastNotifier,
    entries: HashMap<String, Entry>,
    order: VecDeque<String>,
    identity: Identity,
    events: EventHandler,
    sender: mpsc::WeakSender<Command>,
    _registration: Registration,
    // Declared last so all WinRT/COM objects are dropped before RoUninitialize.
    _apartment: Apartment,
}
impl State {
    pub fn new(
        aumid: String,
        events: EventHandler,
        sender: mpsc::WeakSender<Command>,
    ) -> BackendResult<Self> {
        let apartment = Apartment::new().map_err(native_error)?;
        let identity = Identity::initialize(aumid)?;
        let registration = Registration::new(
            &identity.clsid,
            identity.aumid.clone(),
            events.clone(),
            sender.clone(),
        )
        .map_err(native_error)?;
        let notifier =
            ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(&identity.aumid))
                .map_err(native_error)?;
        Ok(Self {
            notifier,
            entries: HashMap::new(),
            order: VecDeque::new(),
            identity,
            events,
            sender,
            _registration: registration,
            _apartment: apartment,
        })
    }
    pub fn show(&mut self, message: &NativeMessage) -> BackendResult<()> {
        if self.notifier.Setting().map_err(native_error)? != NotificationSetting::Enabled {
            return Err(BackendError::new(
                "NOTIFICATIONS_DISABLED",
                "Windows notifications are disabled for Marklab",
            ));
        }
        self.close(&message.id)?;
        if self.entries.len() >= 256
            && let Some(id) = self.order.front().cloned()
        {
            let token = self.entries.get(&id).map(|entry| entry.token.clone());
            self.close(&id)?;
            if let Some(token) = token {
                (self.events)(crate::notifications::Event::Dismissed(token));
            }
        }
        let entry = Entry::new(
            message,
            &self.identity.group,
            self.events.clone(),
            self.sender.clone(),
        )
        .map_err(native_error)?;
        self.notifier.Show(&entry.toast).map_err(native_error)?;
        self.order.push_back(message.id.clone());
        self.entries.insert(message.id.clone(), entry);
        Ok(())
    }
    pub fn close(&mut self, id: &str) -> BackendResult<()> {
        let hide = if let Some(entry) = self.entries.get(id) {
            self.notifier.Hide(&entry.toast)
        } else {
            Ok(())
        };
        // Hide removes the live banner; history removal independently removes
        // its notification-center entry using the exact application/tag/group.
        let history = ToastNotificationManager::History().and_then(|history| {
            history.RemoveGroupedTagWithId(
                &HSTRING::from(identity::tag(id)),
                &HSTRING::from(&self.identity.group),
                &HSTRING::from(&self.identity.aumid),
            )
        });
        hide.and(history).map_err(native_error)?;
        // Keep the object, delegates and service action retryable if either OS
        // removal fails. ApplicationHidden callbacks do not consume the token.
        self.entries.remove(id);
        self.order.retain(|old| old != id);
        Ok(())
    }
    pub fn forget(&mut self, token: &str) {
        let id = self
            .entries
            .iter()
            .find(|(_, entry)| entry.token == token)
            .map(|(id, _)| id.clone());
        if let Some(id) = id {
            self.entries.remove(&id);
            self.order.retain(|old| old != &id);
        }
    }
}
impl Drop for State {
    fn drop(&mut self) {
        for id in self.entries.keys().cloned().collect::<Vec<_>>() {
            if let Err(error) = self.close(&id) {
                log::debug!("Windows notification cleanup failed: {}", error.code);
            }
        }
    }
}
struct Apartment;
impl Apartment {
    fn new() -> windows::core::Result<Self> {
        unsafe {
            RoInitialize(RO_INIT_MULTITHREADED)?;
        }
        Ok(Self)
    }
}
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            RoUninitialize();
        }
    }
}
