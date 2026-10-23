use super::{BackendResult, network};

pub(super) const OUTPUT_WIDTH: u32 = 1920;
pub(super) const OUTPUT_HEIGHT: u32 = 1080;
pub(super) const MAX_DECODE_SIDE: u32 = 8192;
pub(super) const MAX_DECODE_BYTES: u64 = 64 * 1024 * 1024;

// WebView2/GTK cannot limit CapturePreview dimensions without resizing the live
// view. Permit normal 5K/Retina viewports, but bound decoded RGBA storage to 64MiB.
pub(super) fn validate_size(width: u32, height: u32) -> BackendResult<()> {
  if width == 0
    || height == 0
    || width > MAX_DECODE_SIDE
    || height > MAX_DECODE_SIDE
    || u64::from(width) * u64::from(height) > MAX_DECODE_BYTES / 4
  {
    return Err(network::failure(
      "Native capture exceeds supported pixel dimensions",
    ));
  }
  Ok(())
}

#[cfg(any(target_os = "macos", test))]
pub(super) fn snapshot_width_points(width: f64, height: f64, scale: f64) -> BackendResult<f64> {
  if [width, height, scale]
    .iter()
    .any(|value| !value.is_finite() || *value < 1.)
  {
    return Err(network::failure("Invalid native capture geometry"));
  }
  let aspect = width / height;
  if !aspect.is_finite() || aspect <= 0. {
    return Err(network::failure("Invalid native capture aspect ratio"));
  }
  // WKSnapshotConfiguration uses points and preserves the source rect's aspect
  // ratio. TIFF/PNG bitmap dimensions also include the window's backing scale.
  // Keep the old 1920-point worker capture, while capping both physical axes.
  let points = (OUTPUT_WIDTH as f64)
    .min((OUTPUT_WIDTH * 2) as f64 / scale)
    .min((OUTPUT_HEIGHT * 2) as f64 / scale * aspect);
  if !points.is_finite() || points < 1. {
    return Err(network::failure("Native capture geometry is too narrow"));
  }
  Ok(points)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn snapshot_width_respects_aspect_and_backing_scale_for_wide_and_tall_views() {
    for (width, height, scale, expected) in [
      (1920., 1080., 1., 1920.),
      (1920., 1080., 2., 1920.),
      (900., 1200., 2., 810.),
      (3840., 1080., 3., 1280.),
      (1440., 960., 2., 1620.),
      (1280., 720., 4., 960.),
    ] {
      let points = snapshot_width_points(width, height, scale).unwrap();
      assert!((points - expected).abs() < 0.001);
      let pixels = points * scale;
      assert!(pixels <= 3840.001);
      assert!(pixels / (width / height) <= 2160.001);
    }
  }

  #[test]
  fn rejects_invalid_geometry_and_checks_pixel_budget_without_integer_overflow() {
    for (width, height, scale) in [
      (0., 1080., 2.),
      (1920., -1., 2.),
      (1920., 1080., 0.),
      (f64::NAN, 1080., 2.),
      (1920., f64::INFINITY, 2.),
      (1920., 1080., f64::MAX),
    ] {
      assert!(snapshot_width_points(width, height, scale).is_err());
    }
    assert!(validate_size(5120, 2880).is_ok());
    assert!(validate_size(4096, 4096).is_ok());
    for (width, height) in [(0, 1), (8193, 1), (7680, 4320), (u32::MAX, u32::MAX)] {
      assert!(validate_size(width, height).is_err());
    }
  }
}
