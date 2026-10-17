use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
    error::{BackendError, BackendResult},
    workspace::{EmptyRequest, PathRequest},
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use tokio::io::AsyncReadExt;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    id: String,
    name: String,
    created_at: u64,
}
#[derive(Serialize)]
pub struct ThemeList {
    ok: bool,
    themes: Vec<Theme>,
}
#[derive(Serialize)]
pub struct ThemeImport {
    ok: bool,
    theme: Theme,
}
#[derive(Serialize)]
pub struct ThemeCss {
    ok: bool,
    css: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IdRequest {
    id: String,
}

fn id_valid(id: &str) -> BackendResult<()> {
    if id.is_empty()
        || id.len() > 200
        || id.contains("..")
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    {
        return Err(BackendError::new(
            "INVALID_THEME",
            "Invalid theme identifier",
        ));
    }
    Ok(())
}

fn sanitize(css: &str) -> BackendResult<()> {
    super::theme_css::validate(css)
}

async fn directory(window: &WebviewWindow) -> BackendResult<PathBuf> {
    let path = crate::composition::AppPaths::resolve(window.app_handle())
        .await?
        .data_dir
        .join("themes");
    tokio::fs::create_dir_all(&path).await?;
    Ok(path)
}

async fn safe_theme_dir(window: &WebviewWindow, id: &str) -> BackendResult<PathBuf> {
    id_valid(id)?;
    let root = directory(window).await?;
    let path = root.join(id);
    if let Ok(metadata) = tokio::fs::symlink_metadata(&path).await
        && (metadata.file_type().is_symlink() || !metadata.is_dir())
    {
        return Err(BackendError::new(
            "INVALID_THEME",
            "Invalid theme directory",
        ));
    }
    Ok(path)
}

async fn read_css(path: &Path) -> BackendResult<String> {
    let metadata = tokio::fs::symlink_metadata(path).await?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(BackendError::new(
            "INVALID_THEME",
            "Theme must be a CSS file",
        ));
    }
    let file = tokio::fs::File::open(path).await?;
    let mut bytes = Vec::new();
    file.take(512 * 1024 + 1).read_to_end(&mut bytes).await?;
    let css = String::from_utf8(bytes)
        .map_err(|_| BackendError::new("INVALID_THEME", "Theme must be UTF-8"))?;
    sanitize(&css)?;
    Ok(css)
}

#[tauri::command]
pub async fn themes_list(window: WebviewWindow, request: EmptyRequest) -> BackendResult<ThemeList> {
    let _ = request;
    let mut entries = tokio::fs::read_dir(directory(&window).await?).await?;
    let mut themes = Vec::new();
    while let Some(entry) = entries.next_entry().await? {
        if !entry.file_type().await?.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().into_owned();
        if id_valid(&id).is_err() {
            continue;
        }
        let metadata = entry.path().join("theme.json");
        let file = match tokio::fs::File::open(metadata).await {
            Ok(file) => file,
            Err(_) => continue,
        };
        let mut bytes = Vec::new();
        file.take(4096).read_to_end(&mut bytes).await?;
        if let Ok(theme) = serde_json::from_slice::<Theme>(&bytes)
            && theme.id == id
        {
            themes.push(theme);
        }
    }
    themes.sort_by_key(|theme| std::cmp::Reverse(theme.created_at));
    Ok(ThemeList { ok: true, themes })
}

#[tauri::command]
pub async fn themes_import_css(
    window: WebviewWindow,
    request: PathRequest,
) -> BackendResult<ThemeImport> {
    let path = PathBuf::from(&request.path);
    if !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("css"))
    {
        return Err(BackendError::new(
            "INVALID_THEME",
            "Select a CSS theme file",
        ));
    }
    let css = read_css(&path).await?;
    let name = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let theme = Theme {
        id: format!("theme-{}", uuid::Uuid::new_v4()),
        name,
        created_at: crate::assets::now_ms(),
    };
    let target = safe_theme_dir(&window, &theme.id).await?;
    tokio::fs::create_dir(&target).await?;
    let result = async {
        tokio::fs::write(target.join("theme.css"), css).await?;
        tokio::fs::write(target.join("theme.json"), serde_json::to_vec(&theme)?).await?;
        Ok::<(), BackendError>(())
    }
    .await;
    if let Err(error) = result {
        let _ = tokio::fs::remove_dir_all(&target).await;
        return Err(error);
    }
    Ok(ThemeImport { ok: true, theme })
}

#[tauri::command]
pub async fn themes_read_css(window: WebviewWindow, request: IdRequest) -> BackendResult<ThemeCss> {
    let css = if request.id.is_empty() {
        String::new()
    } else {
        read_css(
            &safe_theme_dir(&window, &request.id)
                .await?
                .join("theme.css"),
        )
        .await?
    };
    Ok(ThemeCss { ok: true, css })
}

#[tauri::command]
pub async fn themes_remove(
    window: WebviewWindow,
    request: IdRequest,
) -> BackendResult<super::clipboard::OkResult> {
    let target = safe_theme_dir(&window, &request.id).await?;
    match tokio::fs::remove_dir_all(target).await {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.into()),
    }
    Ok(super::clipboard::OkResult { ok: true })
}

#[tauri::command]
pub async fn themes_open_folder(
    window: WebviewWindow,
    request: EmptyRequest,
) -> BackendResult<super::clipboard::OkResult> {
    let _ = request;
    let path = directory(&window).await?;
    tauri::async_runtime::spawn_blocking(move || {
        window
            .opener()
            .open_path(path.to_string_lossy().as_ref(), None::<&str>)
            .map_err(|e| BackendError::new("OPEN_FAILED", e.to_string()))?;
        Ok(super::clipboard::OkResult { ok: true })
    })
    .await
    .map_err(|e| BackendError::new("OPEN_FAILED", e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn themes_cannot_escape_store_or_fetch_resources() {
        for id in ["", "../theme", "a/b", "a\\b"] {
            assert!(id_valid(id).is_err());
        }
        for css in [
            "@import 'x';",
            "a{background:url(https://example.com)}",
            "@\\69mport 'x'",
        ] {
            assert!(sanitize(css).is_err());
        }
        assert!(sanitize(":root { --background: #111; }").is_ok());
    }
}
