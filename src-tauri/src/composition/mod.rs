//! Typed construction belongs here; Tauri continues to own concrete managed state.
mod core;
mod desktop;
mod factories;
mod paths;

use crate::error::{BackendError, BackendResult};
pub(crate) use desktop::DesktopServices;
use fluxdi::{Error, ErrorKind, Shared};
pub(crate) use paths::AppPaths;
use serde::Deserialize;
use std::{any::type_name, path::PathBuf};

pub(crate) struct HeadlessServices {
    pub database: crate::database::Database,
    pub analysis: crate::analysis::AnalysisService,
}

impl HeadlessServices {
    /// Resolve only the headless providers: no window state, watchers, or registry.
    pub async fn open(data_dir: PathBuf) -> BackendResult<Self> {
        let graph = core::CoreModule::new(Shared::new(core::CoreConfig {
            data_dir,
            exclude_engine_cache: true,
        }));
        let database = graph.database().await.map_err(graph_error)?;
        let analysis = graph.analysis().await.map_err(graph_error)?;
        drop(graph);
        Ok(Self {
            database: take(database)?,
            analysis: take(analysis)?,
        })
    }
}

// FluxDI carries factory errors as text without a source. Keep the backend's
// structured error intact across that boundary, rather than losing its code.
pub(super) fn factory_error(error: BackendError) -> Error {
    let message = serde_json::to_string(&error).unwrap_or_else(|_| {
        String::from(r#"{"code":"SERVICE_GRAPH_FAILED","message":"Cannot encode service initialization failure"}"#)
    });
    Error::new(ErrorKind::FactoryFailed, message)
}

pub(super) fn graph_error(error: Error) -> BackendError {
    #[derive(Deserialize)]
    struct FactoryFailure {
        code: String,
        message: String,
    }
    if error.kind == ErrorKind::FactoryFailed
        && let Ok(failure) = serde_json::from_str::<FactoryFailure>(&error.message)
    {
        return BackendError::new(failure.code, failure.message);
    }
    BackendError::new("SERVICE_GRAPH_FAILED", error.to_string())
}

pub(super) fn take<T>(service: Shared<T>) -> BackendResult<T> {
    Shared::try_unwrap(service).map_err(|_| {
        BackendError::new(
            "SERVICE_GRAPH_OWNERSHIP",
            format!("Service graph still retains {}", type_name::<T>()),
        )
    })
}

#[cfg(test)]
mod tests;
