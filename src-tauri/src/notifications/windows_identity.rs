use super::native_error;
use crate::error::{BackendError, BackendResult};
use sha2::{Digest, Sha256};
use std::{mem::ManuallyDrop, os::windows::ffi::OsStrExt, path::Path};
use windows::{
    Win32::{
        Foundation::PROPERTYKEY,
        System::{
            Com::{
                CLSCTX_INPROC_SERVER, CoCreateInstance, CoTaskMemFree, IPersistFile, STGM_READ,
                StructuredStorage::{
                    InitPropVariantFromCLSID, PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0,
                    PROPVARIANT_0_0_0, PropVariantToStringAlloc,
                },
            },
            Variant::VT_LPWSTR,
        },
        UI::Shell::{
            FOLDERID_Programs, IShellLinkW, KF_FLAG_DEFAULT, PropertiesSystem::IPropertyStore,
            SHGetKnownFolderPath, SHStrDupW, SetCurrentProcessExplicitAppUserModelID, ShellLink,
        },
    },
    core::{GUID, HSTRING, Interface, PCWSTR, PWSTR},
};

// Official Shell property keys (also declared directly by Microsoft's desktop
// toast sample); avoid enabling the unrelated EnhancedStorage API namespace.
const PROPERTY_SET: GUID = GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3);
const APP_ID: PROPERTYKEY = PROPERTYKEY {
    fmtid: PROPERTY_SET,
    pid: 5,
};
const ACTIVATOR: PROPERTYKEY = PROPERTYKEY {
    fmtid: PROPERTY_SET,
    pid: 26,
};

pub(super) struct Identity {
    pub aumid: String,
    pub clsid: GUID,
    pub group: String,
}
impl Identity {
    pub fn initialize(aumid: String) -> BackendResult<Self> {
        if aumid.is_empty()
            || aumid.len() > 128
            || !aumid
                .bytes()
                .all(|value| value.is_ascii_alphanumeric() || b".-_".contains(&value))
        {
            return Err(BackendError::new(
                "NOTIFICATION_IDENTITY",
                "Invalid application notification identity",
            ));
        }
        let digest = Sha256::digest(format!("marklab.toast.activator:{aumid}"));
        let mut bytes = [0_u8; 16];
        bytes.copy_from_slice(&digest[..16]);
        bytes[6] = (bytes[6] & 0x0f) | 0x80;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        let identity = Self {
            group: tag(&aumid),
            clsid: GUID::from_u128(u128::from_be_bytes(bytes)),
            aumid,
        };
        unsafe { SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(&identity.aumid)) }
            .map_err(native_error)?;
        identity.install_shortcut()?;
        Ok(identity)
    }
    fn install_shortcut(&self) -> BackendResult<()> {
        let directory = TaskString(
            unsafe { SHGetKnownFolderPath(&FOLDERID_Programs, KF_FLAG_DEFAULT, None) }
                .map_err(native_error)?,
        );
        let directory =
            std::path::PathBuf::from(unsafe { directory.0.to_string() }.map_err(native_error)?);
        std::fs::create_dir_all(&directory)?;
        // Reuse only a matching current-user installer shortcut. Its target,
        // icon and arguments belong to the installer and remain intact.
        let existing = self.existing_shortcut(&directory);
        let destination = existing
            .clone()
            .unwrap_or_else(|| directory.join(format!("Marklab-{}.lnk", self.group)));
        match std::fs::symlink_metadata(&destination) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || !metadata.is_file() {
                    return Err(BackendError::new(
                        "NOTIFICATION_IDENTITY",
                        "Notification shortcut is not a regular file",
                    ));
                }
                self.verify_owner(&destination)?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        let executable = std::env::current_exe()?;
        let temporary = tempfile::Builder::new()
            .prefix(".marklab-toast-")
            .suffix(".lnk")
            .tempfile_in(destination.parent().unwrap_or(&directory))?;
        unsafe {
            let link = if let Some(path) = &existing {
                load_link(path)?
            } else {
                let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                    .map_err(native_error)?;
                let executable = wide(&executable);
                link.SetPath(PCWSTR(executable.as_ptr()))
                    .map_err(native_error)?;
                link.SetDescription(windows::core::w!("Marklab"))
                    .map_err(native_error)?;
                link
            };
            let properties: IPropertyStore = link.cast().map_err(native_error)?;
            let value = string_property(&self.aumid).map_err(native_error)?;
            properties.SetValue(&APP_ID, &value).map_err(native_error)?;
            let activator = InitPropVariantFromCLSID(&self.clsid).map_err(native_error)?;
            properties
                .SetValue(&ACTIVATOR, &activator)
                .map_err(native_error)?;
            properties.Commit().map_err(native_error)?;
            let file: IPersistFile = link.cast().map_err(native_error)?;
            let path = wide(temporary.path());
            file.Save(PCWSTR(path.as_ptr()), true)
                .map_err(native_error)?;
        }
        temporary
            .persist(&destination)
            .map_err(|error| BackendError::from(error.error))?;
        Ok(())
    }
    fn existing_shortcut(&self, directory: &Path) -> Option<std::path::PathBuf> {
        let nested = directory.join("Marklab");
        let nested_is_directory = std::fs::symlink_metadata(&nested)
            .is_ok_and(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink());
        let mut candidates = vec![directory.join("Marklab.lnk")];
        if nested_is_directory {
            candidates.push(nested.join("Marklab.lnk"));
        }
        candidates.into_iter().find(|path| {
            std::fs::symlink_metadata(path)
                .is_ok_and(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
                && self.verify_owner(path).is_ok()
        })
    }
    fn verify_owner(&self, path: &Path) -> BackendResult<()> {
        unsafe {
            let link = load_link(path)?;
            let properties: IPropertyStore = link.cast().map_err(native_error)?;
            let value = properties.GetValue(&APP_ID).map_err(native_error)?;
            let actual = TaskString(PropVariantToStringAlloc(&value).map_err(native_error)?);
            if actual.0.to_string().map_err(native_error)? != self.aumid {
                return Err(BackendError::new(
                    "NOTIFICATION_IDENTITY",
                    "Notification shortcut belongs to another application",
                ));
            }
        }
        Ok(())
    }
}
unsafe fn load_link(path: &Path) -> BackendResult<IShellLinkW> {
    unsafe {
        let link: IShellLinkW =
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(native_error)?;
        let file: IPersistFile = link.cast().map_err(native_error)?;
        let path = wide(path);
        file.Load(PCWSTR(path.as_ptr()), STGM_READ)
            .map_err(native_error)?;
        Ok(link)
    }
}
pub(super) fn tag(value: &str) -> String {
    // Keep both tag and group within the original Windows 10 16-character limit.
    hex::encode(Sha256::digest(value))[..16].into()
}
fn wide(path: &Path) -> Vec<u16> {
    path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}
unsafe fn string_property(value: &str) -> windows::core::Result<PROPVARIANT> {
    let string = unsafe { SHStrDupW(&HSTRING::from(value))? };
    Ok(PROPVARIANT {
        Anonymous: PROPVARIANT_0 {
            Anonymous: ManuallyDrop::new(PROPVARIANT_0_0 {
                vt: VT_LPWSTR,
                Anonymous: PROPVARIANT_0_0_0 { pwszVal: string },
                ..Default::default()
            }),
        },
    })
}
struct TaskString(PWSTR);
impl Drop for TaskString {
    fn drop(&mut self) {
        unsafe {
            CoTaskMemFree(Some(self.0.0.cast()));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::tag;
    #[test]
    fn stable_native_identity_is_bounded_and_separates_categories() {
        assert_eq!(tag("export:1"), tag("export:1"));
        assert_eq!(tag("sync:中文").encode_utf16().count(), 16);
        assert_ne!(tag("export:1"), tag("sync:1"));
    }
}
