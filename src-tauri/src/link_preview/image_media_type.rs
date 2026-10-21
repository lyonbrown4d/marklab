pub use LinkPreviewImageMediaType as ImageMediaType;
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, specta::Type)]
pub enum LinkPreviewImageMediaType {
  #[serde(rename = "image/avif")]
  Avif,
  #[serde(rename = "image/gif")]
  Gif,
  #[serde(rename = "image/jpeg")]
  Jpeg,
  #[serde(rename = "image/png")]
  Png,
  #[serde(rename = "image/webp")]
  Webp,
}

impl ImageMediaType {
  pub fn from_mime(value: &str) -> Option<Self> {
    match value {
      "image/avif" => Some(Self::Avif),
      "image/gif" => Some(Self::Gif),
      "image/jpeg" => Some(Self::Jpeg),
      "image/png" => Some(Self::Png),
      "image/webp" => Some(Self::Webp),
      _ => None,
    }
  }

  pub fn as_str(self) -> &'static str {
    match self {
      Self::Avif => "image/avif",
      Self::Gif => "image/gif",
      Self::Jpeg => "image/jpeg",
      Self::Png => "image/png",
      Self::Webp => "image/webp",
    }
  }
}

#[cfg(test)]
mod tests {
  #[test]
  fn supported_raster_types_keep_their_wire_mime_names() {
    for mime in [
      "image/avif",
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ] {
      let media_type = super::ImageMediaType::from_mime(mime).unwrap();
      assert_eq!(media_type.as_str(), mime);
      assert_eq!(serde_json::to_value(media_type).unwrap(), mime);
    }
    assert!(super::ImageMediaType::from_mime("image/svg+xml").is_none());
    assert!(super::ImageMediaType::from_mime("text/html").is_none());
  }
}
