use crate::{Result, args::Args};
use clap::CommandFactory;
use clap_complete::{Shell, generate};
use std::io::Write;

pub fn run(shell: Shell) -> Result<()> {
  // Generate into memory so an early-closing stdout pipe is a normal I/O error.
  let mut script = Vec::new();
  generate(shell, &mut Args::command(), "marklab", &mut script);
  std::io::stdout().lock().write_all(&script)?;
  Ok(())
}
