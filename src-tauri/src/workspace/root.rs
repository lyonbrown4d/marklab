use super::RootInfo;
use crate::error::{BackendError, BackendResult};
use std::path::Path;

pub(super) fn prepare_root(
    path: Option<&str>,
    single: bool,
    internal: &Path,
) -> BackendResult<RootInfo> {
    match path {
        None => Ok(RootInfo {
            kind: "internal".into(),
            path: internal.canonicalize()?.to_string_lossy().into_owned(),
        }),
        Some(value) => {
            if value.contains('\0') || !Path::new(value).is_absolute() {
                return Err(BackendError::new(
                    "INVALID_PATH",
                    "Workspace path must be absolute",
                ));
            }
            let target = Path::new(value).canonicalize()?;
            let metadata = target.metadata()?;
            if (single && !metadata.is_file()) || (!single && !metadata.is_dir()) {
                return Err(BackendError::new(
                    "INVALID_PATH",
                    "Workspace target has the wrong file type",
                ));
            }
            Ok(RootInfo {
                kind: if single {
                    "single".into()
                } else if target == internal.canonicalize()? {
                    "internal".into()
                } else {
                    "external".into()
                },
                path: target.to_string_lossy().into_owned(),
            })
        }
    }
}
