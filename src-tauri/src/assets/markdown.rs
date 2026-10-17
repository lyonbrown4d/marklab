use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
    error::{BackendError, BackendResult},
    workspace::{WorkspaceRegistry, safe_asset_path},
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::Manager;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const MAX_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportRequest {
    source_path: String,
    document_path: String,
    strategy: String,
    title: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BytesRequest {
    file_name: String,
    bytes: Vec<u8>,
    document_path: String,
    title: Option<String>,
}
#[derive(Serialize)]
pub struct ImportResult {
    markdown_target: String,
    relative_path: Option<String>,
    asset_dir: Option<String>,
    copied: bool,
}

fn relative(root: &Path, path: &Path) -> Option<String> {
    path.strip_prefix(root)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
}

fn markdown_target(document: &Path, asset: &Path) -> BackendResult<String> {
    let path = pathdiff::diff_paths(asset, document.parent().unwrap_or(document))
        .ok_or_else(|| BackendError::new("INVALID_PATH", "Asset is on another volume"))?;
    Ok(path
        .to_string_lossy()
        .replace('\\', "/")
        .replace(' ', "%20")
        .replace('#', "%23")
        .replace('?', "%3F"))
}

fn stem(value: &str) -> String {
    let clean: String = value
        .chars()
        .take(100)
        .map(|c| {
            if c.is_control() || "/\\:*?\"<>|".contains(c) {
                '-'
            } else {
                c
            }
        })
        .collect();
    let clean = clean.trim_matches(|c: char| c == '.' || c.is_whitespace());
    if clean.is_empty() {
        "asset".into()
    } else {
        clean.into()
    }
}

async fn write_asset(
    window: &WebviewWindow,
    document_path: String,
    name: String,
    title: Option<String>,
    bytes: &[u8],
) -> BackendResult<ImportResult> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_BYTES {
        return Err(BackendError::new(
            "INVALID_ASSET",
            "Asset must contain from 1 byte through 32 MiB",
        ));
    }
    let workspace = window.state::<WorkspaceRegistry>().get(window.label())?;
    let _mutation = workspace.mutation.lock().await;
    window
        .state::<WorkspaceRegistry>()
        .ensure_binding(window.label(), &workspace)?;
    let _commits = workspace.commit_gate.lock().await;
    let check = workspace.clone();
    let (document, directory, asset_dir) = tauri::async_runtime::spawn_blocking(move || {
        let document = check.resolve(&document_path)?;
        let default_title = document
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("document");
        let dir = format!("{}.assets", stem(title.as_deref().unwrap_or(default_title)));
        let parent = document
            .parent()
            .ok_or_else(|| BackendError::new("INVALID_PATH", "Document has no parent"))?;
        let relative_dir = relative(&check.root_directory(), &parent.join(&dir))
            .ok_or_else(|| BackendError::new("INVALID_PATH", "Asset must stay inside workspace"))?;
        let directory = safe_asset_path(&check, &relative_dir)?;
        Ok::<_, BackendError>((document, directory, dir))
    })
    .await
    .map_err(|e| BackendError::new("ASSET_FAILED", e.to_string()))??;
    tokio::fs::create_dir_all(&directory).await?;
    let parsed = Path::new(&name);
    let base = stem(
        parsed
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("asset"),
    );
    let ext: String = parsed
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .take(20)
        .collect();
    for index in 0..10000 {
        workspace.ensure_active()?;
        let suffix = if index == 0 {
            String::new()
        } else {
            format!("-{index}")
        };
        let file_name = format!(
            "{base}{suffix}{}",
            if ext.is_empty() {
                String::new()
            } else {
                format!(".{ext}")
            }
        );
        let target = directory.join(file_name);
        let opened = tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .await;
        let mut file = match opened {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        };
        if let Err(error) = file.write_all(bytes).await {
            drop(file);
            let _ = tokio::fs::remove_file(&target).await;
            return Err(error.into());
        }
        file.sync_all().await?;
        workspace.invalidate(window.app_handle())?;
        return Ok(ImportResult {
            markdown_target: markdown_target(&document, &target)?,
            relative_path: relative(&workspace.root_directory(), &target),
            asset_dir: Some(asset_dir),
            copied: true,
        });
    }
    Err(BackendError::new(
        "ASSET_LIMIT",
        "Too many assets with this name",
    ))
}

#[tauri::command]
pub async fn fs_import_markdown_asset(
    window: WebviewWindow,
    request: ImportRequest,
) -> BackendResult<ImportResult> {
    let path = PathBuf::from(&request.source_path);
    if !path.is_absolute() {
        return Err(BackendError::new(
            "INVALID_PATH",
            "Source asset must be absolute",
        ));
    }
    let path = tokio::fs::canonicalize(path).await?;
    let metadata = tokio::fs::metadata(&path).await?;
    if !metadata.is_file() {
        return Err(BackendError::new(
            "INVALID_ASSET",
            "Source asset must be a file",
        ));
    }
    if request.strategy == "preserve-path" {
        let workspace = window.state::<WorkspaceRegistry>().get(window.label())?;
        return tauri::async_runtime::spawn_blocking(move || {
            let document = workspace.resolve(&request.document_path)?;
            Ok(ImportResult {
                markdown_target: markdown_target(&document, &path)?,
                relative_path: relative(&workspace.root_directory(), &path),
                asset_dir: None,
                copied: false,
            })
        })
        .await
        .map_err(|e| BackendError::new("ASSET_FAILED", e.to_string()))?;
    }
    if request.strategy != "copy-to-document-assets" {
        return Err(BackendError::new(
            "INVALID_REQUEST",
            "Unknown asset import strategy",
        ));
    }
    let mut bytes = Vec::new();
    tokio::fs::File::open(&path)
        .await?
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .await?;
    write_asset(
        &window,
        request.document_path,
        path.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        request.title,
        &bytes,
    )
    .await
}

#[tauri::command]
pub async fn fs_import_markdown_asset_bytes(
    window: WebviewWindow,
    request: BytesRequest,
) -> BackendResult<ImportResult> {
    write_asset(
        &window,
        request.document_path,
        request.file_name,
        request.title,
        &request.bytes,
    )
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolveRequest {
    document_path: String,
    target: String,
}
#[derive(Serialize)]
pub struct ResolveResult {
    source_path: String,
    target: String,
    relative_path: Option<String>,
    is_external: bool,
    media_type: Option<String>,
    exists: bool,
}

#[tauri::command]
pub async fn fs_resolve_markdown_asset(
    window: WebviewWindow,
    request: ResolveRequest,
) -> BackendResult<ResolveResult> {
    let workspace = window.state::<WorkspaceRegistry>().get(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        if request.target.trim().is_empty() || request.target.len() > 32768 {
            return Err(BackendError::new("INVALID_REQUEST", "Invalid asset target"));
        }
        let document = workspace.resolve(&request.document_path)?;
        let external = url::Url::parse(&request.target).is_ok() || request.target.starts_with("//");
        let mut result = ResolveResult {
            source_path: request.document_path,
            target: request.target.clone(),
            relative_path: None,
            is_external: external,
            media_type: None,
            exists: false,
        };
        let target = request.target.split(['?', '#']).next().unwrap_or_default();
        let decoded = percent_encoding::percent_decode_str(target)
            .decode_utf8()
            .map_err(|_| BackendError::new("INVALID_PATH", "Asset target is not UTF-8"))?;
        result.media_type = mime_guess::from_path(decoded.as_ref())
            .first()
            .map(|mime| mime.to_string());
        if external {
            return Ok(result);
        }
        let path = document
            .parent()
            .unwrap_or(&document)
            .join(decoded.as_ref());
        if let Ok(path) = path.canonicalize() {
            result.relative_path = relative(&workspace.root_directory().canonicalize()?, &path);
            result.exists = path.is_file() && result.relative_path.is_some();
        }
        Ok(result)
    })
    .await
    .map_err(|e| BackendError::new("ASSET_FAILED", e.to_string()))?
}
