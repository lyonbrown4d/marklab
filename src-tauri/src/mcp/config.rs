use crate::error::{BackendError, BackendResult};
use std::{collections::BTreeMap, ffi::OsString, path::PathBuf};

#[derive(Debug)]
pub struct Config {
    pub workspace_root: PathBuf,
    pub engine_data_dir: PathBuf,
    pub default_search_limit: usize,
}

impl Config {
    pub fn parse(
        arguments: impl IntoIterator<Item = OsString>,
        environment: impl Fn(&str) -> Option<OsString>,
    ) -> BackendResult<Self> {
        let mut values = BTreeMap::new();
        let mut args = arguments.into_iter();
        while let Some(token) = args.next() {
            let token = token
                .into_string()
                .map_err(|_| invalid("MCP options must be UTF-8"))?;
            let (option, inline) = token
                .split_once('=')
                .map_or((token.as_str(), None), |(key, value)| (key, Some(value)));
            if ![
                "--workspace-root",
                "--engine-data-dir",
                "--default-search-limit",
            ]
            .contains(&option)
            {
                return Err(invalid(
                    "Unknown MCP option; use --workspace-root, --engine-data-dir, or --default-search-limit",
                ));
            }
            let value = match inline {
                Some(value) => OsString::from(value),
                None => args
                    .next()
                    .ok_or_else(|| invalid("MCP option requires a value"))?,
            };
            if value.is_empty() || value.to_string_lossy().starts_with("--") {
                return Err(invalid("MCP option requires a value"));
            }
            if values.insert(option.to_owned(), value).is_some() {
                return Err(invalid("MCP options may only be provided once"));
            }
        }
        let selected = |option: &str, variable: &str| {
            values
                .get(option)
                .cloned()
                .or_else(|| environment(variable))
        };
        let path = |option: &str, variable: &str| -> BackendResult<PathBuf> {
            let value = selected(option, variable)
                .ok_or_else(|| invalid(format!("{option} is required")))?;
            if value.to_string_lossy().trim().is_empty() {
                return Err(invalid(format!("{option} is required")));
            }
            let path = PathBuf::from(value);
            if path.is_absolute() {
                Ok(path)
            } else {
                Ok(std::env::current_dir()
                    .map_err(|_| invalid("Cannot resolve MCP working directory"))?
                    .join(path))
            }
        };
        let limit = selected("--default-search-limit", "MARKLAB_MCP_DEFAULT_SEARCH_LIMIT");
        let default_search_limit = match limit {
            None => 10,
            Some(value)
                if !values.contains_key("--default-search-limit")
                    && value.to_string_lossy().trim().is_empty() =>
            {
                10
            }
            Some(value) => value
                .to_str()
                .and_then(|value| value.trim().parse::<usize>().ok())
                .filter(|limit| (1..=50).contains(limit))
                .ok_or_else(|| invalid("--default-search-limit must be an integer from 1 to 50"))?,
        };
        Ok(Self {
            workspace_root: path("--workspace-root", "MARKLAB_MCP_WORKSPACE_ROOT")?,
            engine_data_dir: path("--engine-data-dir", "MARKLAB_MCP_ENGINE_DATA_DIR")?,
            default_search_limit,
        })
    }

    pub async fn canonicalize(mut self) -> BackendResult<Self> {
        self.workspace_root = directory(&self.workspace_root, "workspace root").await?;
        self.engine_data_dir = directory(&self.engine_data_dir, "engine data directory").await?;
        validate_cache(&self.engine_data_dir).await?;
        Ok(self)
    }
}

async fn validate_cache(engine: &std::path::Path) -> BackendResult<()> {
    let cache = engine.join("tauri-storage");
    for path in [
        cache.clone(),
        cache.join("marklab.sqlite"),
        cache.join("marklab.sqlite-wal"),
        cache.join("marklab.sqlite-shm"),
        cache.join("marklab.sqlite-journal"),
    ] {
        match tokio::fs::symlink_metadata(path).await {
            Ok(metadata) if is_link(&metadata) => {
                return Err(invalid(
                    "MCP engine cache must not contain symbolic links or reparse points",
                ));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(invalid("Cannot inspect MCP engine cache permissions")),
        }
    }
    Ok(())
}

fn is_link(metadata: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_type().is_symlink() || metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

async fn directory(path: &std::path::Path, label: &str) -> BackendResult<PathBuf> {
    let canonical = tokio::fs::canonicalize(path).await.map_err(|_| {
        invalid(format!(
            "MCP {label} must be an existing accessible directory"
        ))
    })?;
    if !tokio::fs::metadata(&canonical)
        .await
        .map_err(|_| invalid(format!("Cannot inspect MCP {label}")))?
        .is_dir()
    {
        return Err(invalid(format!("MCP {label} must be a directory")));
    }
    if canonical.to_str().is_none() {
        return Err(invalid(format!("MCP {label} must be UTF-8")));
    }
    Ok(canonical)
}

pub(super) fn invalid(message: impl Into<String>) -> BackendError {
    BackendError::new("MCP_INVALID_CONFIG", message)
}
