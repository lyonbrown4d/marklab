use super::super::network::failure;
use crate::error::BackendResult;
#[cfg(any(target_os = "macos", target_os = "linux"))]
mod cef;
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub use cef::snapshot;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::snapshot;
