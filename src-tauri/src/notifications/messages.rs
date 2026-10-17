use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Category {
    Export,
    Sync,
    Update,
}
impl Category {
    pub(super) fn name(self) -> &'static str {
        match self {
            Self::Export => "export",
            Self::Sync => "sync",
            Self::Update => "update",
        }
    }
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Action {
    FocusOwner,
    // Only the export worker supplies this path after its successful atomic write.
    RevealExport(PathBuf),
}
#[derive(Clone)]
pub struct Request {
    pub id: String,
    pub category: Category,
    pub owner: Option<String>,
    pub title: String,
    pub body: String,
    pub action: Action,
    pub(super) owner_window: Option<crate::native_window::TrustedWindow>,
}
impl Request {
    pub fn export(id: &str, format: &str, output: &Path, owner: &str, success: bool) -> Self {
        let filename = basename(output);
        let format = format.to_uppercase();
        Self {
            id: format!("export:{id}"),
            category: Category::Export,
            owner: Some(owner.into()),
            title: if success {
                "Export finished"
            } else {
                "Export failed"
            }
            .into(),
            body: if success {
                format!("{format} saved to {filename}")
            } else {
                format!("{format} {filename} failed")
            },
            action: if success {
                Action::RevealExport(output.into())
            } else {
                Action::FocusOwner
            },
            owner_window: None,
        }
    }
    pub fn sync(id: &str, root: &Path, owner: &str, success: bool) -> Self {
        let label = root
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "Workspace".into());
        Self {
            id: format!("sync:{id}"),
            category: Category::Sync,
            owner: Some(owner.into()),
            title: if success {
                "Sync completed"
            } else {
                "Sync failed"
            }
            .into(),
            body: if success {
                format!("{label} is up to date")
            } else {
                format!("{label} needs attention")
            },
            action: Action::FocusOwner,
            owner_window: None,
        }
    }
    pub fn update(version: Option<&str>, owner: Option<String>) -> Self {
        Self {
            id: "update:downloaded".into(),
            category: Category::Update,
            owner,
            title: "Marklab update ready".into(),
            body: match version.filter(|version| !version.is_empty()) {
                Some(version) => {
                    format!("Version {version} has been downloaded. Restart Marklab to install it.")
                }
                None => "An update has been downloaded. Restart Marklab to install it.".into(),
            },
            action: Action::FocusOwner,
            owner_window: None,
        }
    }
    pub fn with_owner(mut self, window: &crate::native_window::TrustedWindow) -> Self {
        self.owner = Some(window.label().into());
        self.owner_window = Some(window.clone());
        self
    }
}
fn basename(path: &Path) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_default()
}
