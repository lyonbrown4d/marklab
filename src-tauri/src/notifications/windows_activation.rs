use super::{Command, EventHandler, forget};
use std::ffi::c_void;
use tokio::sync::mpsc;
use windows::{
    Win32::{
        Foundation::{CLASS_E_NOAGGREGATION, E_INVALIDARG, E_POINTER},
        System::Com::{
            CLSCTX_LOCAL_SERVER, CoRegisterClassObject, CoRevokeClassObject, IClassFactory,
            IClassFactory_Impl, REGCLS_MULTIPLEUSE,
        },
        UI::Notifications::{
            INotificationActivationCallback, INotificationActivationCallback_Impl,
            NOTIFICATION_USER_INPUT_DATA,
        },
    },
    core::{BOOL, GUID, IUnknown, Interface, PCWSTR, Ref, implement},
};

pub(super) struct Registration(u32);
impl Registration {
    pub fn new(
        clsid: &GUID,
        aumid: String,
        events: EventHandler,
        sender: mpsc::WeakSender<Command>,
    ) -> windows::core::Result<Self> {
        let factory: IClassFactory = Factory {
            aumid,
            events,
            sender,
        }
        .into();
        // Only the running class table is registered. There is deliberately no
        // LocalServer32 entry/cold-start export authorization to persist.
        unsafe { CoRegisterClassObject(clsid, &factory, CLSCTX_LOCAL_SERVER, REGCLS_MULTIPLEUSE) }
            .map(Self)
    }
}
impl Drop for Registration {
    fn drop(&mut self) {
        if let Err(error) = unsafe { CoRevokeClassObject(self.0) } {
            log::debug!("Notification COM revocation failed: {}", error.code());
        }
    }
}

#[implement(IClassFactory)]
struct Factory {
    aumid: String,
    events: EventHandler,
    sender: mpsc::WeakSender<Command>,
}
impl IClassFactory_Impl for Factory_Impl {
    fn CreateInstance(
        &self,
        outer: Ref<IUnknown>,
        iid: *const GUID,
        result: *mut *mut c_void,
    ) -> windows::core::Result<()> {
        if iid.is_null() || result.is_null() {
            return Err(E_POINTER.into());
        }
        unsafe {
            *result = std::ptr::null_mut();
        }
        if !outer.is_null() {
            return Err(CLASS_E_NOAGGREGATION.into());
        }
        let callback: INotificationActivationCallback = Callback {
            aumid: self.aumid.clone(),
            events: self.events.clone(),
            sender: self.sender.clone(),
        }
        .into();
        // QueryInterface transfers one reference to the COM caller on success.
        unsafe { callback.query(iid, result).ok() }
    }
    fn LockServer(&self, _lock: BOOL) -> windows::core::Result<()> {
        Ok(())
    }
}

#[implement(INotificationActivationCallback)]
struct Callback {
    aumid: String,
    events: EventHandler,
    sender: mpsc::WeakSender<Command>,
}
impl INotificationActivationCallback_Impl for Callback_Impl {
    fn Activate(
        &self,
        aumid: &PCWSTR,
        arguments: &PCWSTR,
        _data: *const NOTIFICATION_USER_INPUT_DATA,
        _count: u32,
    ) -> windows::core::Result<()> {
        let actual_aumid = unsafe { bounded_string(*aumid, 128)? };
        let token = unsafe { bounded_string(*arguments, 64)? };
        if actual_aumid != self.aumid || uuid::Uuid::parse_str(&token).is_err() {
            return Err(E_INVALIDARG.into());
        }
        (self.events)(crate::notifications::Event::Activated(token.clone()));
        forget(&self.sender, &token);
        Ok(())
    }
}

// COM marshals these null-terminated input strings; cap the scan before making
// owned allocations. The callback carries only an opaque service-issued token.
unsafe fn bounded_string(value: PCWSTR, limit: usize) -> windows::core::Result<String> {
    if value.is_null() {
        return Err(E_POINTER.into());
    }
    let mut chars = Vec::with_capacity(limit);
    for index in 0..=limit {
        let character = unsafe { *value.0.add(index) };
        if character == 0 {
            return String::from_utf16(&chars).map_err(|_| E_INVALIDARG.into());
        }
        if index == limit {
            return Err(E_INVALIDARG.into());
        }
        chars.push(character);
    }
    Err(E_INVALIDARG.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn factory_callbacks_route_only_valid_application_tokens() -> windows::core::Result<()> {
        let received = Arc::new(Mutex::new(Vec::new()));
        let copy = received.clone();
        let events: EventHandler = Arc::new(move |event| {
            if let crate::notifications::Event::Activated(token) = event {
                copy.lock().unwrap().push(token);
            }
        });
        let (sender, _receiver) = mpsc::channel(1);
        let factory: IClassFactory = Factory {
            aumid: "app.marklab.tauri.desktop".into(),
            events,
            sender: sender.downgrade(),
        }
        .into();
        let callback: INotificationActivationCallback = unsafe { factory.CreateInstance(None)? };
        let aumid: Vec<u16> = "app.marklab.tauri.desktop\0".encode_utf16().collect();
        let other: Vec<u16> = "app.other\0".encode_utf16().collect();
        let token = uuid::Uuid::new_v4().to_string();
        let argument: Vec<u16> = format!("{token}\0").encode_utf16().collect();
        unsafe {
            callback.Activate(PCWSTR(aumid.as_ptr()), PCWSTR(argument.as_ptr()), &[])?;
            assert!(
                callback
                    .Activate(PCWSTR(other.as_ptr()), PCWSTR(argument.as_ptr()), &[])
                    .is_err()
            );
        }
        assert_eq!(*received.lock().unwrap(), [token]);
        Ok(())
    }

    #[test]
    fn callback_arguments_reject_excessive_or_invalid_utf16() {
        let long: Vec<u16> = "long\0".encode_utf16().collect();
        let malformed = [0xd800_u16, 0];
        unsafe {
            assert!(bounded_string(PCWSTR(long.as_ptr()), 3).is_err());
            assert!(bounded_string(PCWSTR(malformed.as_ptr()), 64).is_err());
            assert!(bounded_string(PCWSTR::null(), 64).is_err());
        }
    }
}
