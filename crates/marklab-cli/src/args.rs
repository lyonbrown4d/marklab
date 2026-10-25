use clap::{Args as ClapArgs, Parser, Subcommand, ValueEnum, ValueHint};
use marklab_document::ExportFormat;
use std::path::PathBuf;

#[derive(Parser)]
#[command(
  name = "marklab",
  version,
  about = "Export Markdown locally without the desktop app"
)]
pub struct Args {
  /// Suppress progress and successful-operation messages; errors remain visible.
  #[arg(short, long, global = true)]
  pub quiet: bool,
  /// Disable animated progress while retaining status messages.
  #[arg(long, global = true)]
  pub no_progress: bool,
  #[command(subcommand)]
  pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
  /// Convert a Markdown file, directory, or standard input (-).
  Export(ExportArgs),
  /// Combine a directory or an ordered book.toml into one publication.
  Publish(PublishArgs),
  /// Print document analysis or its renderer Markdown AST as JSON.
  Inspect(InspectArgs),
  /// Generate a shell completion script on stdout.
  Completions {
    #[arg(value_enum)]
    shell: clap_complete::Shell,
  },
}

#[derive(ClapArgs)]
pub struct InspectArgs {
  #[arg(value_hint = ValueHint::FilePath)]
  pub input: PathBuf,
  /// Print the renderer AST instead of document headings, links, and counts.
  #[arg(long)]
  pub ast: bool,
}

#[derive(Clone, Copy, ValueEnum)]
pub enum Format {
  Html,
  Txt,
  Epub,
  Pdf,
  Docx,
  Markdown,
}

impl From<Format> for ExportFormat {
  fn from(value: Format) -> Self {
    match value {
      Format::Html => Self::Html,
      Format::Txt => Self::Txt,
      Format::Epub => Self::Epub,
      Format::Pdf => Self::Pdf,
      Format::Docx => Self::Docx,
      Format::Markdown => Self::Markdown,
    }
  }
}

#[derive(ClapArgs)]
pub struct Filters {
  /// Include matching relative paths (repeatable; glob syntax).
  #[arg(long)]
  pub include: Vec<String>,
  /// Exclude matching relative paths (repeatable; takes precedence).
  #[arg(long)]
  pub exclude: Vec<String>,
}

#[derive(ClapArgs)]
pub struct ExportArgs {
  #[arg(value_hint = ValueHint::AnyPath)]
  pub input: PathBuf,
  #[arg(long, value_enum)]
  pub format: Format,
  /// Destination file or directory; - writes HTML, TXT, or Markdown to stdout.
  #[arg(short, long, value_hint = ValueHint::AnyPath)]
  pub output: PathBuf,
  #[arg(long)]
  pub recursive: bool,
  /// Maximum concurrent file conversions for directory exports.
  #[arg(long, default_value_t = default_jobs(), value_parser = parse_jobs)]
  pub jobs: usize,
  #[command(flatten)]
  pub filters: Filters,
  #[arg(long)]
  pub overwrite: bool,
  /// Allowed root for local images (required for images read from stdin).
  #[arg(long, value_hint = ValueHint::DirPath)]
  pub resource_root: Option<PathBuf>,
}

#[derive(ClapArgs)]
pub struct PublishArgs {
  #[arg(value_hint = ValueHint::AnyPath)]
  pub input: PathBuf,
  #[arg(long, value_enum)]
  pub format: Format,
  #[arg(short, long, value_hint = ValueHint::AnyPath)]
  pub output: PathBuf,
  #[arg(long)]
  pub title: Option<String>,
  #[arg(long)]
  pub locale: Option<String>,
  #[command(flatten)]
  pub filters: Filters,
  #[arg(long)]
  pub overwrite: bool,
  #[arg(long, value_hint = ValueHint::DirPath)]
  pub resource_root: Option<PathBuf>,
}

fn default_jobs() -> usize {
  std::thread::available_parallelism().map_or(1, |jobs| jobs.get().min(4))
}

fn parse_jobs(value: &str) -> Result<usize, String> {
  let jobs = value
    .parse::<usize>()
    .map_err(|_| "jobs must be a positive integer".to_owned())?;
  if jobs == 0 {
    return Err("jobs must be greater than zero".into());
  }
  if jobs > 64 {
    return Err("jobs must not exceed 64".into());
  }
  Ok(jobs)
}
