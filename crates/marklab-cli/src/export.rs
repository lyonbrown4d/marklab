use crate::{
  Result,
  args::ExportArgs,
  files::{self, Selection},
  links, source,
};
use marklab_document::{ExportFormat, PublicationOptions, render};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::{collections::BTreeMap, io::Write, path::Path};
use tokio_util::sync::CancellationToken;

pub fn run(
  args: ExportArgs,
  cancelled: &CancellationToken,
  ui: crate::progress::Options,
) -> Result<()> {
  let progress = crate::progress::Progress::new(ui, "Preparing export");
  let format = ExportFormat::from(args.format);
  let stdout = args.output == Path::new("-");
  if stdout
    && !matches!(
      format,
      ExportFormat::Html | ExportFormat::Txt | ExportFormat::Markdown
    )
  {
    return Err("Only HTML, TXT, and Markdown can be written to stdout".into());
  }
  if args.input == Path::new("-") {
    let document = source::stdin(args.resource_root.as_deref(), cancelled)?;
    let options = PublicationOptions::document(format, document.title.clone());
    let output = if stdout {
      None
    } else {
      let output = files::absolute(&args.output)?;
      files::preflight(&[], std::slice::from_ref(&output), args.overwrite)?;
      Some(output)
    };
    let bytes = render(format, &[document], &options, cancelled)?;
    save(output.as_deref(), &bytes, args.overwrite, cancelled)?;
    progress.finish("Exported standard input".into());
    return Ok(());
  }
  if std::fs::symlink_metadata(&args.input)?
    .file_type()
    .is_symlink()
  {
    return Err("Symlink input is not followed".into());
  }
  let input = args.input.canonicalize()?;
  let directory = input.is_dir();
  if directory && stdout {
    return Err("Directory export requires an output directory".into());
  }
  let selection = Selection::new(&args.filters)?;
  let output = if stdout {
    None
  } else {
    Some(files::absolute(&args.output)?)
  };
  if directory && output.as_deref() == Some(input.as_path()) {
    return Err("Output directory must differ from the input directory".into());
  }
  let sources = if directory {
    files::discover(
      &input,
      args.recursive,
      &selection,
      output.as_deref(),
      cancelled,
    )?
  } else {
    if !input.is_file() {
      return Err("Input must be a Markdown file or directory".into());
    }
    if !selection.accepts(Path::new(input.file_name().ok_or("Invalid input file")?)) {
      return Err("Input excluded by filters".into());
    }
    vec![input.clone()]
  };
  let outputs = if let Some(output) = &output {
    sources
      .iter()
      .map(|source| {
        if directory {
          output
            .join(source.strip_prefix(&input).unwrap_or(source))
            .with_extension(format.extension())
        } else {
          output.clone()
        }
      })
      .collect::<Vec<_>>()
  } else {
    vec![]
  };
  files::preflight(&sources, &outputs, args.overwrite)?;
  if directory {
    progress.batch(sources.len());
  }
  let default_root = if directory {
    input.as_path()
  } else {
    input.parent().ok_or("Input has no parent")?
  };
  let root = args
    .resource_root
    .as_deref()
    .unwrap_or(default_root)
    .canonicalize()?;
  let targets: BTreeMap<_, _> = if directory && format == ExportFormat::Html {
    sources
      .iter()
      .zip(&outputs)
      .map(|(source, output)| (source.clone(), output.to_string_lossy().into_owned()))
      .collect()
  } else {
    BTreeMap::new()
  };
  let failures = AtomicUsize::new(0);
  let convert = |index: usize| {
    let path = &sources[index];
    progress.message(format!("Exporting {}", path.display()));
    let result = (|| -> Result<()> {
      marklab_document::check_cancelled(cancelled)?;
      let mut document = source::file(path, &root, source::title(path))?;
      if directory && format == ExportFormat::Html {
        let parent = outputs[index].parent().ok_or("Output has no parent")?;
        document.markdown = links::rewrite(&document.markdown, path, &targets, Some(parent));
      }
      let options = PublicationOptions::document(format, document.title.clone());
      let bytes = render(format, &[document], &options, cancelled)?;
      save(
        outputs.get(index).map(|path| path.as_path()),
        &bytes,
        args.overwrite,
        cancelled,
      )?;
      progress.completed(format!("Exported {}", path.display()));
      Ok(())
    })();
    if let Err(error) = result {
      failures.fetch_add(1, Ordering::Relaxed);
      progress.error(format!("{}: {error}", path.display()));
    }
  };
  if directory {
    let next = AtomicUsize::new(0);
    std::thread::scope(|scope| {
      for _ in 0..args.jobs.min(sources.len()) {
        let next = &next;
        let convert = &convert;
        let sources = &sources;
        scope.spawn(move || {
          loop {
            if cancelled.is_cancelled() {
              break;
            }
            let index = next.fetch_add(1, Ordering::Relaxed);
            if index >= sources.len() {
              break;
            }
            convert(index);
          }
        });
      }
    });
  } else {
    convert(0);
  }
  marklab_document::check_cancelled(cancelled)?;
  let failures = failures.load(Ordering::Relaxed);
  progress.finish(format!(
    "Export finished: {} succeeded, {failures} failed",
    sources.len() - failures
  ));
  if failures > 0 {
    return Err(format!("{failures} document(s) failed").into());
  }
  Ok(())
}

fn save(
  output: Option<&Path>,
  bytes: &[u8],
  overwrite: bool,
  cancelled: &CancellationToken,
) -> Result<()> {
  marklab_document::check_cancelled(cancelled)?;
  if let Some(output) = output {
    files::write(output, bytes, overwrite, cancelled)
  } else {
    std::io::stdout().lock().write_all(bytes)?;
    Ok(())
  }
}
