//! Validate CSV allocation budgets as bytes enter the high-level parser.
use csv_core::ReadRecordResult;
use std::io::{Error, ErrorKind, Read};

pub struct CsvGuard<R> {
  input: R,
  parser: csv_core::Reader,
  record_bytes: usize,
  record_fields: usize,
  pub limited: bool,
}

impl<R> CsvGuard<R> {
  pub fn new(input: R, delimiter: u8) -> Self {
    Self {
      input,
      parser: csv_core::ReaderBuilder::new().delimiter(delimiter).build(),
      record_bytes: 0,
      record_fields: 0,
      limited: false,
    }
  }

  fn validate(&mut self, input: &[u8]) -> std::io::Result<()> {
    let mut position = 0;
    let mut output = [0u8; 8192];
    let mut ends = [0usize; 256];
    loop {
      let (result, consumed, written, fields) =
        self
          .parser
          .read_record(&input[position..], &mut output, &mut ends);
      position += consumed;
      self.record_bytes += written;
      self.record_fields += fields;
      if self.record_bytes > 4 * 1024 * 1024 || self.record_fields > 4096 {
        self.limited = true;
        return Err(Error::new(
          ErrorKind::InvalidData,
          "Spreadsheet record exceeds preview limits",
        ));
      }
      match result {
        ReadRecordResult::Record => {
          self.record_bytes = 0;
          self.record_fields = 0;
        }
        ReadRecordResult::InputEmpty | ReadRecordResult::End => return Ok(()),
        _ => {}
      }
      if position == input.len() && !input.is_empty() {
        return Ok(());
      }
    }
  }
}

impl<R: Read> Read for CsvGuard<R> {
  fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
    if buffer.is_empty() {
      return Ok(0);
    }
    let count = self.input.read(buffer)?;
    self.validate(&buffer[..count])?;
    Ok(count)
  }
}
