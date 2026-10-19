use super::limits;
use crate::error::BackendResult;
use std::io::{Read, Seek, SeekFrom};

pub fn check<R: Read + Seek>(reader: &mut R) -> BackendResult<()> {
  let length = reader.seek(SeekFrom::End(0))?;
  let tail_length = length.min(65_557) as usize;
  reader.seek(SeekFrom::End(-(tail_length as i64)))?;
  let mut tail = vec![0; tail_length];
  reader.read_exact(&mut tail)?;
  let mut found = false;
  for index in (0..tail.len().saturating_sub(21)).rev() {
    if &tail[index..index + 4] != b"PK\x05\x06" {
      continue;
    }
    if index + 22 + number(&tail, index + 20) as usize != tail.len() {
      continue;
    }
    if !single_disk(&tail, index) {
      return Err(limits::invalid(
        "Multi-volume Excel archives are unsupported",
      ));
    }
    if number(&tail, index + 10) > 512 {
      return Err(limits::error(
        "Workbook archive directory exceeds the preview limit",
      ));
    }
    found = true;
    break;
  }
  if !found {
    return Err(limits::invalid("Excel archive has no valid directory"));
  }
  check_fallbacks(reader, length)?;
  reader.seek(SeekFrom::Start(0))?;
  Ok(())
}

fn check_fallbacks<R: Read + Seek>(reader: &mut R, length: u64) -> BackendResult<()> {
  // Zip9 can fall back to an earlier directory after a malformed later one.
  // Scan bounded windows, including earlier records followed by trailing data.
  let mut buffer = vec![0; 65_557];
  let mut offset = 0;
  let mut candidates = 0;
  while offset + 22 <= length {
    let count = (length - offset).min(buffer.len() as u64) as usize;
    reader.seek(SeekFrom::Start(offset))?;
    reader.read_exact(&mut buffer[..count])?;
    for index in 0..count.saturating_sub(21) {
      if &buffer[index..index + 4] != b"PK\x05\x06" || !single_disk(&buffer, index) {
        continue;
      }
      let position = offset + index as u64;
      if position + 22 + number(&buffer, index + 20) as u64 > length {
        continue;
      }
      candidates += 1;
      if candidates > 16 {
        return Err(limits::invalid(
          "Workbook contains ambiguous archive directories",
        ));
      }
      if position >= 20 && signature(reader, position - 20)? == *b"PK\x06\x07" {
        return Err(limits::error(
          "ZIP64 workbooks exceed the supported preview directory format",
        ));
      }
      if number(&buffer, index + 10) <= 512 {
        continue;
      }
      let directory = integer(&buffer, index + 16) as u64;
      let size = integer(&buffer, index + 12) as u64;
      let declared = directory + 4 <= position && signature(reader, directory)? == *b"PK\x01\x02";
      let actual = size <= position
        && position - size + 4 <= position
        && signature(reader, position - size)? == *b"PK\x01\x02";
      if declared || actual {
        return Err(limits::error(
          "Workbook archive fallback directory exceeds 512 entries",
        ));
      }
    }
    if offset + count as u64 == length {
      break;
    }
    offset += (count - 21) as u64;
  }
  Ok(())
}

fn single_disk(bytes: &[u8], index: usize) -> bool {
  number(bytes, index + 4) == 0
    && number(bytes, index + 6) == 0
    && number(bytes, index + 8) == number(bytes, index + 10)
}

fn number(bytes: &[u8], index: usize) -> u16 {
  u16::from_le_bytes([bytes[index], bytes[index + 1]])
}

fn integer(bytes: &[u8], index: usize) -> u32 {
  u32::from_le_bytes([
    bytes[index],
    bytes[index + 1],
    bytes[index + 2],
    bytes[index + 3],
  ])
}

fn signature<R: Read + Seek>(reader: &mut R, position: u64) -> BackendResult<[u8; 4]> {
  reader.seek(SeekFrom::Start(position))?;
  let mut signature = [0; 4];
  reader.read_exact(&mut signature)?;
  Ok(signature)
}
