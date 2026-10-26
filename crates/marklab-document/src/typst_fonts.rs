//! Cache only requested font faces; typst-as-lib otherwise reloads FontPath on every lookup.
use std::{collections::VecDeque, sync::Mutex};
use typst::{
  Library, World,
  diag::FileResult,
  foundations::{Bytes, Datetime, Duration},
  syntax::{FileId, Source},
  text::{Font, FontBook},
  utils::LazyHash,
};

const MAX_FONT_BYTES: usize = 256 * 1024 * 1024;
const MAX_FONT_FACES: usize = 64;
#[derive(Default)]
pub(super) struct FontCache(Mutex<VecDeque<(usize, Option<Font>)>>);

impl FontCache {
  fn get(&self, id: usize, load: impl FnOnce() -> Option<Font>) -> Option<Font> {
    let mut fonts = match self.0.lock() {
      Ok(fonts) => fonts,
      Err(poisoned) => poisoned.into_inner(),
    };
    if let Some(index) = fonts.iter().position(|(cached, _)| *cached == id) {
      let entry = fonts.remove(index)?;
      let font = entry.1.clone();
      fonts.push_back(entry);
      return font;
    }
    // Keep the lock through loading so concurrent layout cannot read the same
    // collection repeatedly. Only this small font cache is locked here.
    let font = load();
    let size = font.as_ref().map_or(0, |font| font.data().len());
    if size <= MAX_FONT_BYTES {
      let mut bytes = fonts
        .iter()
        .filter_map(|(_, font)| font.as_ref())
        .map(|font| font.data().len())
        .sum::<usize>();
      while bytes + size > MAX_FONT_BYTES || fonts.len() >= MAX_FONT_FACES {
        if let Some((_, removed)) = fonts.pop_front() {
          bytes -= removed.as_ref().map_or(0, |font| font.data().len());
        } else {
          break;
        }
      }
      fonts.push_back((id, font.clone()));
    }
    font
  }
}

pub(super) struct CachedWorld<'a> {
  pub inner: &'a dyn World,
  pub fonts: &'a FontCache,
}

impl World for CachedWorld<'_> {
  fn library(&self) -> &LazyHash<Library> {
    self.inner.library()
  }
  fn book(&self) -> &LazyHash<FontBook> {
    self.inner.book()
  }
  fn main(&self) -> FileId {
    self.inner.main()
  }
  fn source(&self, id: FileId) -> FileResult<Source> {
    self.inner.source(id)
  }
  fn file(&self, id: FileId) -> FileResult<Bytes> {
    self.inner.file(id)
  }
  fn font(&self, id: usize) -> Option<Font> {
    self.book().info(id)?;
    self.fonts.get(id, || self.inner.font(id))
  }
  fn today(&self, offset: Option<Duration>) -> Option<Datetime> {
    self.inner.today(offset)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::atomic::{AtomicUsize, Ordering};
  use typst_as_lib::{TypstEngine, typst_kit_options::TypstKitFontOptions};

  #[test]
  fn font_cache_loads_requested_faces_once_and_reuses_them_between_jobs() {
    let cache = FontCache::default();
    assert!(cache.0.lock().expect("cache").is_empty(), "no eager loads");
    let loads = AtomicUsize::new(0);
    let engine = TypstEngine::builder()
      .search_fonts_with(
        TypstKitFontOptions::default()
          .include_system_fonts(false)
          .include_embedded_fonts(true),
      )
      .build();
    for _ in 0..2 {
      engine
        .with_world("main.typ", |world| {
          for _ in 0..20 {
            let font = cache.get(0, || {
              loads.fetch_add(1, Ordering::SeqCst);
              world.font(0)
            });
            assert!(font.is_some(), "embedded font available");
          }
          let cached = CachedWorld {
            inner: world,
            fonts: &cache,
          };
          assert!(
            cached.font(usize::MAX).is_none(),
            "invalid ids cannot panic"
          );
        })
        .expect("world");
    }
    assert_eq!(
      loads.load(Ordering::SeqCst),
      1,
      "repeated requests avoid disk parsing and hashing"
    );
  }
}
