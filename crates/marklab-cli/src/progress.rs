use indicatif::{ProgressBar, ProgressStyle};
use std::{
  io::{self, IsTerminal},
  time::Duration,
};

#[derive(Clone, Copy)]
pub struct Options {
  pub quiet: bool,
  pub no_progress: bool,
}

pub struct Progress {
  bar: Option<ProgressBar>,
  quiet: bool,
}

impl Progress {
  pub fn new(options: Options, message: &str) -> Self {
    let bar = if !options.quiet && !options.no_progress && io::stderr().is_terminal() {
      let bar = ProgressBar::new_spinner();
      if let Ok(style) = ProgressStyle::with_template("{spinner:.cyan} {msg} [{elapsed_precise}]") {
        bar.set_style(style);
      }
      bar.set_message(message.to_owned());
      bar.enable_steady_tick(Duration::from_millis(100));
      Some(bar)
    } else {
      None
    };
    Self {
      bar,
      quiet: options.quiet,
    }
  }

  pub fn batch(&self, count: usize) {
    if let Some(bar) = &self.bar {
      bar.set_length(count as u64);
      if let Ok(style) =
        ProgressStyle::with_template("{spinner:.cyan} [{bar:24.cyan/dim}] {pos}/{len} {msg}")
      {
        bar.set_style(style.progress_chars("=>-"));
      }
    }
  }

  pub fn message(&self, message: String) {
    if let Some(bar) = &self.bar {
      bar.set_message(message);
    }
  }

  pub fn completed(&self, message: String) {
    if let Some(bar) = &self.bar {
      bar.inc(1);
    } else if !self.quiet {
      eprintln!("{message}");
    }
  }

  pub fn error(&self, message: String) {
    if let Some(bar) = &self.bar {
      bar.println(message);
      bar.inc(1);
    } else {
      eprintln!("{message}");
    }
  }

  pub fn finish(&self, message: String) {
    if let Some(bar) = &self.bar {
      bar.finish_and_clear();
    }
    if !self.quiet {
      eprintln!("{message}");
    }
  }
}

impl Drop for Progress {
  fn drop(&mut self) {
    if let Some(bar) = &self.bar {
      bar.finish_and_clear();
    }
  }
}
