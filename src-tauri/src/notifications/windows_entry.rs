use super::{Command, EventHandler, NativeMessage, forget};
use tokio::sync::mpsc;
use windows::{
    Data::Xml::Dom::XmlDocument,
    Foundation::TypedEventHandler,
    UI::Notifications::{
        ToastDismissalReason, ToastDismissedEventArgs, ToastFailedEventArgs, ToastNotification,
    },
    core::{HSTRING, IInspectable},
};

pub(super) struct Entry {
    pub toast: ToastNotification,
    pub token: String,
    activated: Option<i64>,
    dismissed: Option<i64>,
    failed: Option<i64>,
}
impl Entry {
    pub fn new(
        message: &NativeMessage,
        group: &str,
        events: EventHandler,
        sender: mpsc::WeakSender<Command>,
    ) -> windows::core::Result<Self> {
        let document = XmlDocument::new()?;
        document.LoadXml(&HSTRING::from(xml(message)))?;
        let toast = ToastNotification::CreateToastNotification(&document)?;
        toast.SetTag(&HSTRING::from(super::identity::tag(&message.id)))?;
        toast.SetGroup(&HSTRING::from(group))?;
        let mut entry = Self {
            toast,
            token: message.token.clone(),
            activated: None,
            dismissed: None,
            failed: None,
        };
        let token = message.token.clone();
        let activated_events = events.clone();
        let activated_sender = sender.clone();
        entry.activated = Some(entry.toast.Activated(&TypedEventHandler::<
            ToastNotification,
            IInspectable,
        >::new(move |_, _| {
            activated_events(crate::notifications::Event::Activated(token.clone()));
            forget(&activated_sender, &token);
            Ok(())
        }))?);
        let token = message.token.clone();
        let dismissed_events = events.clone();
        let dismissed_sender = sender.clone();
        entry.dismissed = Some(entry.toast.Dismissed(&TypedEventHandler::<
            ToastNotification,
            ToastDismissedEventArgs,
        >::new(move |_, arguments| {
            // A banner timeout does not remove its Action Center action. Keep
            // the service token and COM activator alive for that later click.
            if let Some(arguments) = arguments.as_ref()
                && arguments.Reason()? == ToastDismissalReason::UserCanceled
            {
                dismissed_events(crate::notifications::Event::Dismissed(token.clone()));
                forget(&dismissed_sender, &token);
            }
            Ok(())
        }))?);
        let token = message.token.clone();
        entry.failed = Some(entry.toast.Failed(&TypedEventHandler::<
            ToastNotification,
            ToastFailedEventArgs,
        >::new(move |_, arguments| {
            if let Some(arguments) = arguments.as_ref() {
                log::warn!(
                    "Windows notification delivery failed: {}",
                    arguments.ErrorCode()?
                );
            }
            events(crate::notifications::Event::Dismissed(token.clone()));
            forget(&sender, &token);
            Ok(())
        }))?);
        Ok(entry)
    }
    pub fn detach(&mut self) {
        if let Some(token) = self.activated.take() {
            let _ = self.toast.RemoveActivated(token);
        }
        if let Some(token) = self.dismissed.take() {
            let _ = self.toast.RemoveDismissed(token);
        }
        if let Some(token) = self.failed.take() {
            let _ = self.toast.RemoveFailed(token);
        }
    }
}
impl Drop for Entry {
    fn drop(&mut self) {
        self.detach();
    }
}
fn xml(message: &NativeMessage) -> String {
    format!(
        "<toast launch=\"{}\"><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual></toast>",
        escape(&message.token),
        escape(&message.title),
        escape(&message.body)
    )
}
fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn renders_text_and_opaque_arguments_without_xml_injection() {
        let message = NativeMessage {
            id: "export:1".into(),
            token: "token\"".into(),
            title: "<action>".into(),
            body: "A & B 中文".into(),
        };
        let output = xml(&message);
        assert!(output.contains("launch=\"token&quot;\""));
        assert!(output.contains("&lt;action&gt;"));
        assert!(output.contains("A &amp; B 中文"));
    }
}
