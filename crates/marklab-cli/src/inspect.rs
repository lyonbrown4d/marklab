use crate::{Result, args::InspectArgs, source};
use std::{
  fs::File,
  io::{self, Write},
  path::Path,
};
use tokio_util::sync::CancellationToken;

pub fn run(
  args: InspectArgs,
  cancelled: &CancellationToken,
  ui: crate::progress::Options,
) -> Result<()> {
  let progress = crate::progress::Progress::new(ui, "Inspecting Markdown");
  marklab_document::check_cancelled(cancelled)?;
  let (path, content) = if args.input == Path::new("-") {
    ("stdin.md".into(), source::stdin_text(cancelled)?)
  } else {
    let metadata = std::fs::symlink_metadata(&args.input)?;
    if metadata.file_type().is_symlink() {
      return Err("Symlink input is not followed".into());
    }
    if !metadata.is_file() {
      return Err("Inspection input must be a regular file".into());
    }
    let canonical = args.input.canonicalize()?;
    (
      canonical.to_string_lossy().into_owned(),
      source::text(File::open(canonical)?)?,
    )
  };
  marklab_document::check_cancelled(cancelled)?;
  let mut stdout = io::stdout().lock();
  if args.ast {
    serde_json::to_writer_pretty(&mut stdout, &marklab_document::markdown::parse(&content)?)?;
  } else {
    serde_json::to_writer_pretty(
      &mut stdout,
      &marklab_document::analysis::parse(path, content)?,
    )?;
  }
  stdout.write_all(b"\n")?;
  progress.finish("Inspection complete".into());
  Ok(())
}
