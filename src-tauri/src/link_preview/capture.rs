mod native;
mod pool;
mod worker;
use super::{network, sanitize};
use crate::{error::BackendResult, native_window::TrustedWindow};
pub(super) use pool::Workers;
use tauri::Manager;

pub(super) async fn capture(
    workers: &Workers,
    window: &TrustedWindow,
    url: String,
    generation: u64,
) -> BackendResult<Vec<u8>> {
    tokio::time::timeout(std::time::Duration::from_secs(20), async {
        super::ensure_generation(window.app_handle(), window.label(), generation)?;
        let normalized = network::normalize(&url)?;
        let response = network::fetch(normalized).await?;
        let html = sanitize::document(response).await?;
        let mut lease = workers.checkout(window, generation).await?;
        lease.worker()?.document(html).await?;
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        let bytes = native::snapshot(lease.worker()?.view()?).await?;
        let bytes = crate::blocking::run(move || normalize_image(bytes)).await?;
        super::ensure_generation(window.app_handle(), window.label(), generation)?;
        lease.release().await?;
        Ok(bytes)
    })
    .await
    .map_err(|_| network::failure("Web preview capture timed out"))?
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
