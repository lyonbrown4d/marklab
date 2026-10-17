mod native;
use super::{network, sanitize};
use crate::{assets::AssetService, error::BackendResult, native_window::TrustedWindow};
use std::sync::{Arc, Mutex};
use tauri::{
    Manager, Webview, WebviewBuilder, WebviewUrl,
    webview::{NewWindowResponse, PageLoadEvent, PermissionResponse},
};
struct Worker {
    view: Option<Webview>,
    app: tauri::AppHandle,
    label: String,
}
impl Drop for Worker {
    fn drop(&mut self) {
        if let Some(view) = self.view.take() {
            let _ = view.close();
        }
        let app = self.app.clone();
        let label = self.label.clone();
        tauri::async_runtime::spawn(async move {
            let _ = crate::blocking::run(move || app.state::<AssetService>().revoke_window(&label))
                .await;
        });
    }
}
pub async fn capture(
    window: &TrustedWindow,
    url: String,
    generation: u64,
) -> BackendResult<Vec<u8>> {
    tokio::time::timeout(
        std::time::Duration::from_secs(20),
        capture_inner(window, url, generation),
    )
    .await
    .map_err(|_| network::failure("Web preview capture timed out"))?
}
async fn capture_inner(
    window: &TrustedWindow,
    url: String,
    generation: u64,
) -> BackendResult<Vec<u8>> {
    let normalized = network::normalize(&url)?;
    let response = network::fetch(normalized.clone()).await?;
    let html = sanitize::document(response).await?;
    let label = format!("capture-{}", uuid::Uuid::new_v4());
    let app = window.app_handle().clone();
    let owner = label.clone();
    let original_owner = window.label().to_owned();
    let (capability, mut worker) = crate::blocking::run(move || {
        super::ensure_generation(&app, &original_owner, generation)?;
        let worker = Worker {
            view: None,
            app: app.clone(),
            label: owner.clone(),
        };
        let capability = app.state::<AssetService>().issue_bytes(
            &owner,
            html.as_bytes(),
            "preview.html",
            "text/html",
        )?;
        Ok((capability, worker))
    })
    .await?;
    let allowed = crate::assets::resource_url(&capability.url);
    let (sender, loaded) = tokio::sync::oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let builder = WebviewBuilder::new(
        &label,
        WebviewUrl::External(
            url::Url::parse(&allowed)
                .map_err(|_| network::failure("Invalid capture capability"))?,
        ),
    )
    .incognito(true)
    .devtools(false)
    .focused(false)
    .disable_javascript()
    .on_download(|_, _| false)
    .on_new_window(|_, _| NewWindowResponse::Deny)
    .on_permission_request(|_, _| PermissionResponse::Deny)
    .on_navigation(move |url| url.as_str() == allowed)
    .on_page_load(move |_, payload| {
        if payload.event() == PageLoadEvent::Finished
            && let Ok(mut sender) = sender.lock()
            && let Some(sender) = sender.take()
        {
            let _ = sender.send(());
        }
    });
    let parent = window.as_ref().as_ref().window();
    let worker = crate::blocking::run(move || {
        worker.view = Some(parent.add_child(
            builder,
            tauri::LogicalPosition::new(-10000., -10000.),
            tauri::LogicalSize::new(1920., 1080.),
        )?);
        Ok(worker)
    })
    .await?; // Keep the offscreen child mapped for native engine rendering.
    loaded
        .await
        .map_err(|_| network::failure("Web preview document failed to load"))?;
    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    let bytes = native::snapshot(
        worker
            .view
            .as_ref()
            .ok_or_else(|| network::failure("Capture view is unavailable"))?,
    )
    .await?;
    let bytes = crate::blocking::run(move || normalize_image(bytes)).await?;
    super::ensure_generation(window.app_handle(), window.label(), generation)?;
    Ok(bytes)
}

pub(super) fn normalize_image(bytes: Vec<u8>) -> BackendResult<Vec<u8>> {
    if bytes.len() > 32 * 1024 * 1024 {
        return Err(network::failure(
            "Native capture exceeds maximum encoded size",
        ));
    }
    let mut reader =
        image::ImageReader::with_format(std::io::Cursor::new(bytes), image::ImageFormat::Png);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(3840);
    limits.max_image_height = Some(2160);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|_| network::failure("Native capture returned an invalid or oversized image"))?;
    if image.width() > 3840 || image.height() > 2160 {
        return Err(network::failure(
            "Native capture exceeds the supported dimensions",
        ));
    }
    let image = image.resize_exact(1920, 1080, image::imageops::FilterType::Triangle);
    let mut output = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|_| network::failure("Cannot encode web preview capture"))?;
    Ok(output.into_inner())
}

#[cfg(test)]
mod tests {
    #[test]
    fn normalizes_native_png_dimensions_and_rejects_invalid_images() {
        let image = image::RgbaImage::new(20, 10);
        let mut bytes = std::io::Cursor::new(Vec::new());
        image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
        let output = super::normalize_image(bytes.into_inner()).unwrap();
        let reader =
            image::ImageReader::with_format(std::io::Cursor::new(output), image::ImageFormat::Png);
        assert_eq!(reader.into_dimensions().unwrap(), (1920, 1080));
        assert!(super::normalize_image(b"not png".to_vec()).is_err());
    }
}
