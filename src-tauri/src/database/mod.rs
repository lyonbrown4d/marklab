use crate::error::{BackendError, BackendResult};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use std::{path::Path, time::Duration};
#[cfg(windows)]
use unicode_normalization::UnicodeNormalization;

#[derive(Clone)]
pub struct Database {
    pub pool: sqlx::SqlitePool,
}

impl Database {
    pub async fn open(app_data_dir: &Path) -> BackendResult<Self> {
        if !app_data_dir.is_absolute() {
            return Err(BackendError::new(
                "invalid_path",
                "App data directory must be absolute",
            ));
        }
        let directory = app_data_dir.join("tauri-storage");
        tokio::fs::create_dir_all(&directory).await?;
        restrict_permissions(&directory, 0o700).await?;
        let options = SqliteConnectOptions::new()
            .filename(directory.join("marklab.sqlite"))
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .busy_timeout(Duration::from_secs(10));
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await?;
        restrict_permissions(&directory.join("marklab.sqlite"), 0o600).await?;
        sqlx::raw_sql(include_str!("schema.sql"))
            .execute(&pool)
            .await?;
        Ok(Self { pool })
    }
}

pub fn workspace_key(kind: &str, path: &str) -> BackendResult<String> {
    if !["internal", "external", "single"].contains(&kind)
        || !Path::new(path).is_absolute()
        || path.contains('\0')
    {
        return Err(BackendError::new(
            "invalid_workspace",
            "Workspace identity requires a valid kind and absolute path",
        ));
    }
    // Registry roots are already canonical. Preserve Unix spelling: case-sensitive
    // volumes and Linux Unicode/backslash names may identify different directories.
    #[cfg(windows)]
    let canonical = path
        .replace('\\', "/")
        .nfc()
        .collect::<String>()
        .to_lowercase();
    #[cfg(not(windows))]
    let canonical = path.to_owned();
    let trimmed = if canonical == "/" || canonical.ends_with(":/") {
        canonical.as_str()
    } else {
        canonical.trim_end_matches('/')
    };
    Ok(format!("{kind}:{trimmed}"))
}

#[cfg(unix)]
async fn restrict_permissions(path: &Path, mode: u32) -> BackendResult<()> {
    use std::os::unix::fs::PermissionsExt;
    tokio::fs::set_permissions(path, std::fs::Permissions::from_mode(mode)).await?;
    Ok(())
}
#[cfg(not(unix))]
async fn restrict_permissions(_path: &Path, _mode: u32) -> BackendResult<()> {
    Ok(())
}

#[cfg(test)]
mod tests;
