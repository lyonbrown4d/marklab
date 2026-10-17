use crate::error::{BackendError, BackendResult};
use std::collections::BTreeMap;
use typst_as_lib::{TypstEngine, typst_kit_options::TypstKitFontOptions};
use typst_layout::PagedDocument;

pub fn quoted(value: &str) -> String {
    use typst::foundations::Repr;
    // Typst's own formatter handles control characters and markup as literal
    // data, including escapes whose syntax differs from JSON (\u{...}).
    value.repr().to_string()
}

pub fn compile(source: String, assets: BTreeMap<String, Vec<u8>>) -> BackendResult<PagedDocument> {
    let engine = TypstEngine::builder()
        .main_file(source)
        .with_static_file_resolver(
            assets
                .iter()
                .map(|(name, bytes)| (name.as_str(), bytes.clone())),
        )
        .search_fonts_with(
            TypstKitFontOptions::default()
                .include_system_fonts(true)
                .include_embedded_fonts(true),
        )
        .build();
    engine
        .compile()
        .output
        .map_err(|error| BackendError::new("EXPORT_RENDER_FAILED", format!("Typst: {error:?}")))
}

pub fn math(value: &str) -> BackendResult<String> {
    if value.len() > 64 * 1024 {
        return Err(BackendError::new(
            "INVALID_DOCUMENT",
            "Equation exceeds export limit",
        ));
    }
    mitex::convert_math(value, None).map_err(|error| BackendError::new("INVALID_MATH", error))
}

pub struct RasterImage {
    pub png: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

pub fn raster(source: String, assets: BTreeMap<String, Vec<u8>>) -> BackendResult<RasterImage> {
    let document = compile(
        format!("#set page(width: auto, height: auto, margin: 0pt)\n{source}"),
        assets,
    )?;
    let page = document
        .pages()
        .first()
        .ok_or_else(|| BackendError::new("EXPORT_RENDER_FAILED", "Image has no page"))?;
    if page.frame.size().x.to_pt() > 4096.0 || page.frame.size().y.to_pt() > 4096.0 {
        return Err(BackendError::new(
            "FILE_TOO_LARGE",
            "Export image dimensions exceed limit",
        ));
    }
    let options = typst_render::RenderOptions {
        pixel_per_pt: 2.0.into(),
        ..Default::default()
    };
    let pixmap = typst_render::render(page, &options);
    let png = pixmap
        .encode_png()
        .map_err(|error| BackendError::new("EXPORT_RENDER_FAILED", error.to_string()))?;
    Ok(RasterImage {
        png,
        width: pixmap.width(),
        height: pixmap.height(),
    })
}

pub fn equation_png(value: &str, block: bool) -> BackendResult<RasterImage> {
    let expression = math(value)?;
    raster(
        format!("#set text(size: 11pt)\n#math.equation(block: {block})[${expression}$]"),
        BTreeMap::new(),
    )
}

pub fn asset_png(value: &[u8]) -> BackendResult<RasterImage> {
    raster(
        "#image(\"asset\", width: 480pt)".into(),
        BTreeMap::from([("asset".into(), value.to_vec())]),
    )
}
