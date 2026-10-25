use crate::{
  Result,
  args::PublishArgs,
  files::{self, Selection},
  links, source,
};
use marklab_document::{ExportFormat, PublicationOptions, assets::MAX_TOTAL_IMAGE_BYTES, render};
use serde::Deserialize;
use std::{
  collections::{BTreeMap, BTreeSet},
  fs::File,
  io::Read,
  path::{Path, PathBuf},
};
use tokio_util::sync::CancellationToken;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
  title: Option<String>,
  locale: Option<String>,
  chapters: Vec<Chapter>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Chapter {
  path: PathBuf,
  title: Option<String>,
}

pub fn run(
  args: PublishArgs,
  cancelled: &CancellationToken,
  ui: crate::progress::Options,
) -> Result<()> {
  let progress = crate::progress::Progress::new(ui, "Preparing publication");
  if args.input == Path::new("-") || args.output == Path::new("-") {
    return Err("Publishing requires filesystem input and output paths".into());
  }
  if std::fs::symlink_metadata(&args.input)?
    .file_type()
    .is_symlink()
  {
    return Err("Symlink input is not followed".into());
  }
  let input = args.input.canonicalize()?;
  let output = files::absolute(&args.output)?;
  let selection = Selection::new(&args.filters)?;
  let (root, chapters, title, locale) = if input.is_dir() {
    let files = files::discover(&input, true, &selection, Some(&output), cancelled)?;
    let title = input
      .file_name()
      .map(|name| name.to_string_lossy().into_owned())
      .unwrap_or_else(|| "Publication".into());
    (
      input.clone(),
      files
        .into_iter()
        .map(|path| Chapter { path, title: None })
        .collect(),
      Some(title),
      None,
    )
  } else {
    if !input.is_file() {
      return Err("Book manifest must be a regular file".into());
    }
    let root = input
      .parent()
      .ok_or("Manifest has no parent")?
      .to_path_buf();
    let mut text = String::new();
    File::open(&input)?
      .take(1024 * 1024 + 1)
      .read_to_string(&mut text)?;
    if text.len() > 1024 * 1024 {
      return Err("Book manifest exceeds 1 MiB".into());
    }
    let manifest: Manifest = toml::from_str(&text)?;
    let mut chapters = Vec::new();
    for chapter in manifest.chapters {
      if chapter.path.is_absolute() {
        return Err("Manifest chapter paths must be relative".into());
      }
      let path = root.join(&chapter.path);
      let canonical = path.canonicalize()?;
      if !canonical.starts_with(&root) {
        return Err("Manifest chapter escapes its directory".into());
      }
      if selection.accepts(canonical.strip_prefix(&root)?) {
        chapters.push(Chapter {
          path,
          title: chapter.title,
        });
      }
    }
    (root, chapters, manifest.title, manifest.locale)
  };
  if chapters.is_empty() || chapters.len() > 1000 {
    return Err("Publication must contain between 1 and 1000 chapters".into());
  }
  let paths: Vec<_> = chapters
    .iter()
    .map(|chapter| chapter.path.canonicalize())
    .collect::<std::io::Result<_>>()?;
  let unique: BTreeSet<_> = paths.iter().collect();
  if unique.len() != paths.len() {
    return Err("Publication contains a repeated chapter path".into());
  }
  let mut protected = paths.clone();
  protected.push(input);
  files::preflight(&protected, std::slice::from_ref(&output), args.overwrite)?;
  let format = ExportFormat::from(args.format);
  let mut options = PublicationOptions::document(
    format,
    args.title.or(title).unwrap_or_else(|| "Publication".into()),
  );
  options.locale = args.locale.or(locale).unwrap_or_else(|| "en-US".into());
  options.cover = true;
  options.table_of_contents = true;
  options.page_breaks = true;
  options.validate()?;
  let resource_root = args
    .resource_root
    .as_deref()
    .unwrap_or(&root)
    .canonicalize()?;
  let targets: BTreeMap<_, _> = paths
    .iter()
    .enumerate()
    .map(|(index, path)| (path.clone(), format!("#chapter-{index}")))
    .collect();
  let (mut text_bytes, mut image_bytes) = (0, 0);
  let mut documents = Vec::new();
  for chapter in chapters {
    marklab_document::check_cancelled(cancelled)?;
    progress.message(format!("Loading {}", chapter.path.display()));
    let title = chapter
      .title
      .unwrap_or_else(|| source::title(&chapter.path));
    if title.trim().is_empty() || title.chars().count() > 200 {
      return Err("Chapter title must contain 1–200 characters".into());
    }
    let mut document = source::file(&chapter.path, &resource_root, title)?;
    text_bytes += document.markdown.len();
    image_bytes += document.assets.values().map(Vec::len).sum::<usize>();
    if text_bytes > source::MAX_TEXT || image_bytes > MAX_TOTAL_IMAGE_BYTES {
      return Err("Publication exceeds the 64 MiB text or 100 MiB image limit".into());
    }
    if format == ExportFormat::Html {
      document.markdown = links::rewrite(&document.markdown, &chapter.path, &targets, None);
    }
    documents.push(document);
  }
  progress.message(format!("Rendering {} chapters", documents.len()));
  let bytes = render(format, &documents, &options, cancelled)?;
  progress.message("Saving publication".into());
  files::write(&output, &bytes, args.overwrite, cancelled)?;
  progress.finish(format!(
    "Published {} chapters to {}",
    documents.len(),
    output.display()
  ));
  Ok(())
}
