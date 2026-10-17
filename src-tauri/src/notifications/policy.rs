use super::Category;
use crate::settings::PersistedValue;

#[derive(Clone, Copy, Debug)]
pub(super) struct Preferences {
    enabled: bool,
    background_only: bool,
    exports: bool,
    sync: bool,
    updates: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            enabled: true,
            background_only: true,
            exports: true,
            sync: true,
            updates: true,
        }
    }
}
impl Preferences {
    pub fn parse(value: Option<&PersistedValue>) -> Self {
        let Some(value) = value else {
            return Self::default();
        };
        let keys = [
            "desktopNotificationsEnabled",
            "desktopNotificationsBackgroundOnly",
            "desktopNotificationExportsEnabled",
            "desktopNotificationSyncEnabled",
            "desktopNotificationUpdatesEnabled",
        ];
        // Match the existing Zod policy: malformed preference fields discard this preference set.
        if keys.iter().any(|key| {
            value
                .state
                .get(*key)
                .is_some_and(|value| !value.is_boolean())
        }) {
            return Self::default();
        }
        let boolean = |key: &str| {
            value
                .state
                .get(key)
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(true)
        };
        Self {
            enabled: boolean(keys[0]),
            background_only: boolean(keys[1]),
            exports: boolean(keys[2]),
            sync: boolean(keys[3]),
            updates: boolean(keys[4]),
        }
    }
    pub fn allows(self, category: Category, any_window_focused: bool) -> bool {
        self.enabled
            && (!self.background_only || !any_window_focused)
            && match category {
                Category::Export => self.exports,
                Category::Sync => self.sync,
                Category::Update => self.updates,
            }
    }
}
