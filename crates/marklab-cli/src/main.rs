mod args;
mod completions;
mod export;
mod files;
mod inspect;
mod links;
mod progress;
mod publish;
mod source;

use clap::Parser;
use tokio_util::sync::CancellationToken;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

#[tokio::main(flavor = "current_thread")]
async fn main() -> std::process::ExitCode {
  let args = args::Args::parse();
  let ui = progress::Options {
    quiet: args.quiet,
    no_progress: args.no_progress,
  };
  let cancelled = CancellationToken::new();
  let worker_cancelled = cancelled.clone();
  let mut worker = tokio::task::spawn_blocking(move || match args.command {
    args::Command::Export(args) => export::run(args, &worker_cancelled, ui),
    args::Command::Publish(args) => publish::run(args, &worker_cancelled, ui),
    args::Command::Inspect(args) => inspect::run(args, &worker_cancelled, ui),
    args::Command::Completions { shell } => completions::run(shell),
  });
  let result = tokio::select! {
      result = &mut worker => result,
      signal = tokio::signal::ctrl_c() => {
          if let Err(error) = signal { eprintln!("marklab: signal handler: {error}"); }
          cancelled.cancel();
          worker.await
      }
  };
  match result {
    Ok(Ok(())) => std::process::ExitCode::SUCCESS,
    Ok(Err(error)) => {
      eprintln!("marklab: {error}");
      std::process::ExitCode::from(if cancelled.is_cancelled() { 130 } else { 1 })
    }
    Err(error) => {
      eprintln!("marklab: export worker failed: {error}");
      std::process::ExitCode::FAILURE
    }
  }
}
