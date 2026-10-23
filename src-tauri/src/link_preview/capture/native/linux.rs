use super::{BackendResult, failure};
use webkit2gtk::prelude::*;

pub async fn snapshot(view: &tauri::Webview) -> BackendResult<Vec<u8>> {
  let (sender, receiver) = tokio::sync::oneshot::channel();
  view.with_webview(move |platform| {
    platform.inner().snapshot(
      webkit2gtk::SnapshotRegion::Visible,
      webkit2gtk::SnapshotOptions::NONE,
      None::<&webkit2gtk::gio::Cancellable>,
      move |result| {
        let result = result
          .map_err(|error| failure(&error.to_string()))
          .and_then(|surface| {
            let mut surface = cairo::ImageSurface::try_from(surface)
              .map_err(|_| failure("WebKit returned an unsupported capture surface"))?;
            let width = surface.width();
            let height = surface.height();
            let stride = surface.stride();
            let format = surface.format();
            if width <= 0 || height <= 0 {
              return Err(failure("Native capture exceeds supported dimensions"));
            }
            super::super::image_geometry::validate_size(width as u32, height as u32)?;
            if !matches!(format, cairo::Format::Rgb24 | cairo::Format::ARgb32) {
              return Err(failure(
                "WebKit returned an unsupported capture pixel format",
              ));
            }
            let required = usize::try_from(stride)
              .ok()
              .and_then(|stride| stride.checked_mul(height as usize))
              .filter(|bytes| *bytes as u64 <= super::super::image_geometry::MAX_DECODE_BYTES)
              .ok_or_else(|| failure("Native capture pixels exceed supported storage"))?;
            let data = surface
              .data()
              .map_err(|_| failure("Native capture pixels are unavailable"))?;
            if data.len() != required {
              return Err(failure("Native capture pixel storage is incomplete"));
            }
            let data = data.to_vec();
            Ok((
              data,
              width as u32,
              height as u32,
              stride as usize,
              format == cairo::Format::Rgb24,
            ))
          });
        let _ = sender.send(result);
      },
    );
  })?;
  let (pixels, width, height, stride, opaque) = receiver
    .await
    .map_err(|_| failure("Native capture callback was cancelled"))??;
  crate::blocking::run(move || {
    let mut rgba = Vec::with_capacity((width * height * 4) as usize);
    for row in pixels.chunks(stride).take(height as usize) {
      for pixel in row.chunks_exact(4).take(width as usize) {
        let native = u32::from_ne_bytes([pixel[0], pixel[1], pixel[2], pixel[3]]);
        let alpha = if opaque { 255 } else { (native >> 24) as u8 };
        let channel = |shift| {
          let value = (native >> shift) & 255;
          if alpha == 0 {
            0
          } else {
            (value * 255 / (alpha as u32)).min(255) as u8
          }
        };
        rgba.extend_from_slice(&[channel(16), channel(8), channel(0), alpha]);
      }
    }
    let image = image::RgbaImage::from_raw(width, height, rgba)
      .ok_or_else(|| failure("Invalid native capture pixels"))?;
    let mut encoded = std::io::Cursor::new(Vec::new());
    image
      .write_to(&mut encoded, image::ImageFormat::Png)
      .map_err(|_| failure("Cannot encode native capture"))?;
    Ok(encoded.into_inner())
  })
  .await
}
