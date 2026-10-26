use super::{BackendResult, network};

pub(super) const OUTPUT_WIDTH: u32 = 1920;
pub(super) const OUTPUT_HEIGHT: u32 = 1080;
pub(super) const MAX_DECODE_SIDE: u32 = 8192;
pub(super) const MAX_DECODE_BYTES: u64 = 64 * 1024 * 1024;

// Permit normal 5K/Retina viewports, but bound decoded RGBA storage to 64 MiB.
// CEF additionally reduces screenshot resolution before allocating capture pixels.
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn checks_pixel_budget_without_integer_overflow() {
    assert!(validate_size(5120, 2880).is_ok());
    assert!(validate_size(4096, 4096).is_ok());
    for (width, height) in [(0, 1), (8193, 1), (7680, 4320), (u32::MAX, u32::MAX)] {
      assert!(validate_size(width, height).is_err());
    }
  }
}
