use crate::error::{BackendError, BackendResult};
use crate::typst_fonts::{CachedWorld, FontCache};
use std::{
  borrow::Cow,
  collections::{BTreeMap, HashMap},
  sync::{Arc, Mutex, OnceLock},
};
use typst::{
  diag::{FileError, FileResult},
  foundations::{Bytes, Dict, Value},
  syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot},
};
use typst_as_lib::file_resolver::FileResolver;
use typst_as_lib::{TypstEngine, typst_kit_options::TypstKitFontOptions};
use typst_layout::PagedDocument;

pub fn quoted(value: &str) -> String {
  use typst::foundations::Repr;
  // Typst's own formatter handles control characters and markup as literal
  // data, including escapes whose syntax differs from JSON (\u{...}).
  value.repr().to_string()
}

// Initialization is lazy and one-time; a constructor panic leaves OnceLock
// unset so a later request can retry. The static type also enforces Send + Sync.
static RENDERER: OnceLock<Renderer> = OnceLock::new();
const MAX_SOURCE: usize = 128 * 1024 * 1024;
const MAX_ASSETS: usize = 100 * 1024 * 1024;
// Existing publication limits are 1,000 chapters and 50 images per chapter.
const MAX_ASSET_COUNT: usize = 1000 * 50;
type ImageMap = HashMap<FileId, Bytes>;
#[derive(Clone, Default)]
struct JobAssets(Arc<Mutex<ImageMap>>);
impl FileResolver for JobAssets {
  fn resolve_binary(&self, id: FileId) -> FileResult<Cow<'_, Bytes>> {
    let images = match self.0.lock() {
      Ok(images) => images,
      Err(poisoned) => poisoned.into_inner(),
    };
    images
      .get(&id)
      .cloned()
      .map(Cow::Owned)
      .ok_or(FileError::AccessDenied)
  }
  fn resolve_source(&self, _id: FileId) -> FileResult<Cow<'_, Source>> {
    Err(FileError::AccessDenied)
  }
}
struct JobGuard(JobAssets);
impl Drop for JobGuard {
  fn drop(&mut self) {
    // Recover only the bounded transient map; the immutable engine is not
    // modified during compile. This also cleans up if upstream unwinds.
    match self.0.0.lock() {
      Ok(mut images) => images.clear(),
      Err(poisoned) => poisoned.into_inner().clear(),
    }
  }
}
struct Renderer {
  engine: TypstEngine,
  assets: JobAssets,
  operation: Mutex<()>,
  fonts: FontCache,
}
impl Renderer {
  fn new() -> Self {
    let assets = JobAssets::default();
    let engine = TypstEngine::builder()
      .with_static_source_file_resolver([(
        "main.typ",
        "#eval(sys.inputs.document, mode: \"markup\")",
      )])
      .add_file_resolver(assets.clone())
      .search_fonts_with(
        TypstKitFontOptions::default()
          .include_system_fonts(true)
          .include_embedded_fonts(true),
      )
      .build();
    Self {
      engine,
      assets,
      operation: Mutex::new(()),
      fonts: FontCache::default(),
    }
  }
  fn compile(&self, source: String, assets: ImageMap) -> BackendResult<PagedDocument> {
    // All callers run on blocking workers. Serialize the shared resolver,
    // including failure cleanup, so no job observes another job's bytes.
    let _operation = match self.operation.lock() {
      Ok(guard) => guard,
      Err(poisoned) => poisoned.into_inner(),
    };
    let _job = JobGuard(self.assets.clone());
    match self.assets.0.lock() {
      Ok(mut images) => *images = assets,
      Err(poisoned) => *poisoned.into_inner() = assets,
    }
    let mut inputs = Dict::new();
    inputs.insert("document".into(), Value::Str(source.into()));
    // Build a fresh source/input world, preserving job isolation and the
    // upstream zero-age memo eviction while reusing only loaded font faces.
    let world = self
      .engine
      .world_builder("main.typ")
      .with_inputs(inputs)
      .build()
      .map_err(|error| BackendError::new("EXPORT_RENDER_FAILED", format!("Typst: {error:?}")))?;
    let world = CachedWorld {
      inner: &world,
      fonts: &self.fonts,
    };
    let output = typst::compile::<PagedDocument>(&world).output;
    typst::comemo::evict(0);
    output.map_err(|error| BackendError::new("EXPORT_RENDER_FAILED", format!("Typst: {error:?}")))
  }
}
pub fn compile(source: String, assets: BTreeMap<String, Vec<u8>>) -> BackendResult<PagedDocument> {
  let total = assets
    .values()
    .try_fold(0usize, |total, value| total.checked_add(value.len()));
  if source.len() > MAX_SOURCE
    || assets.len() > MAX_ASSET_COUNT
    || assets.values().any(|bytes| bytes.len() > 15 * 1024 * 1024)
    || total.is_none_or(|bytes| bytes > MAX_ASSETS)
  {
    return Err(BackendError::new(
      "FILE_TOO_LARGE",
      "Typst export exceeds source or image budget",
    ));
  }
  let assets = assets
    .into_iter()
    .map(|(name, bytes)| {
      let path = VirtualPath::new(&name)
        .map_err(|error| BackendError::new("INVALID_PATH", error.to_string()))?;
      Ok((
        RootedPath::new(VirtualRoot::Project, path).intern(),
        Bytes::new(bytes),
      ))
    })
    .collect::<BackendResult<ImageMap>>()?;
  RENDERER.get_or_init(Renderer::new).compile(source, assets)
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

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn engine_reuses_discovery_without_reusing_job_source_or_assets_after_failure() {
    let page = "#set page(width: 100pt, height: 50pt, margin: 0pt)\n";
    let first = compile(
      format!("{page}Alpha #image(\"asset\", width: 20pt)"),
      BTreeMap::from([(
        "asset".into(),
        include_bytes!("fixtures/chart.png").to_vec(),
      )]),
    )
    .expect("first source and image");
    let identity = RENDERER.get().expect("initialized renderer") as *const Renderer;
    let replaced = compile(
      format!("{page}#image(\"asset\")"),
      BTreeMap::from([("asset".into(), b"invalid replacement image".to_vec())]),
    );
    assert!(
      replaced.is_err(),
      "same name must use current job's image bytes"
    );
    assert!(
      compile(format!("{page}#image(\"asset\")"), BTreeMap::new()).is_err(),
      "missing images cannot inherit a previous job's image"
    );
    let recovered = compile(format!("{page}Beta"), BTreeMap::new()).expect("failure is retryable");
    assert_eq!(
      identity,
      RENDERER.get().expect("same renderer") as *const Renderer
    );
    let options = typst_render::RenderOptions::default();
    let before = typst_render::render(&first.pages()[0], &options);
    let after = typst_render::render(&recovered.pages()[0], &options);
    assert_ne!(
      before.data(),
      after.data(),
      "new source cannot reuse the previous job's rendered content"
    );
    let renderer = RENDERER.get().expect("renderer");
    let _operation = renderer.operation.lock().expect("no in-flight compile");
    assert!(
      renderer
        .assets
        .0
        .lock()
        .expect("transient assets")
        .is_empty()
    );
  }
}
