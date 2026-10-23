mod image_geometry;
mod native;
pub(super) use native::snapshot;
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
  let dimensions = image::ImageReader::with_format(
    std::io::Cursor::new(bytes.as_slice()),
    image::ImageFormat::Png,
  )
  .into_dimensions()
  .map_err(|_| network::failure("Native capture returned an invalid image"))?;
  image_geometry::validate_size(dimensions.0, dimensions.1)?;
  let mut reader =
    image::ImageReader::with_format(std::io::Cursor::new(bytes), image::ImageFormat::Png);
  let mut limits = image::Limits::default();
  limits.max_image_width = Some(image_geometry::MAX_DECODE_SIDE);
  limits.max_image_height = Some(image_geometry::MAX_DECODE_SIDE);
  limits.max_alloc = Some(image_geometry::MAX_DECODE_BYTES);
  reader.limits(limits);
  let image = reader
    .decode()
    .map_err(|_| network::failure("Native capture returned an invalid or oversized image"))?;
  let resized = image
    .resize(
      image_geometry::OUTPUT_WIDTH,
      image_geometry::OUTPUT_HEIGHT,
      image::imageops::FilterType::Triangle,
    )
    .to_rgba8();
  let mut image =
    image::RgbaImage::new(image_geometry::OUTPUT_WIDTH, image_geometry::OUTPUT_HEIGHT);
  let x = (image.width() - resized.width()) / 2;
  let y = (image.height() - resized.height()) / 2;
  image::imageops::replace(&mut image, &resized, i64::from(x), i64::from(y));
  let mut output = std::io::Cursor::new(Vec::new());
  image
    .write_to(&mut output, image::ImageFormat::Png)
    .map_err(|_| network::failure("Cannot encode web preview capture"))?;
  Ok(output.into_inner())
}

#[cfg(test)]
mod tests {
  #[test]
  fn normalizes_native_png_dimensions_without_stretching_and_rejects_invalid_images() {
    let image = image::RgbaImage::from_pixel(20, 10, image::Rgba([200, 10, 20, 255]));
    let mut bytes = std::io::Cursor::new(Vec::new());
    image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
    let output = super::normalize_image(bytes.into_inner()).unwrap();
    let output = image::load_from_memory(&output).unwrap().to_rgba8();
    assert_eq!(output.dimensions(), (1920, 1080));
    assert_eq!(output.get_pixel(960, 540).0, [200, 10, 20, 255]);
    assert_eq!(output.get_pixel(960, 0).0, [0, 0, 0, 0]);
    assert!(super::normalize_image(b"not png".to_vec()).is_err());
  }
}
