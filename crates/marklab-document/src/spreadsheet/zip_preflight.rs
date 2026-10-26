//! Guard ZIP expansion and XML allocation hints before handing data to calamine.
use super::limits;
use crate::error::BackendResult;
use quick_xml::{
  Reader,
  events::{BytesStart, Event},
};
use std::{
  collections::HashSet,
  io::{BufReader, Read, Seek},
};

pub fn check<R: Read + Seek>(reader: &mut R) -> BackendResult<()> {
  check_mode(reader, false)
}

pub fn check_calculation<R: Read + Seek>(reader: &mut R) -> BackendResult<()> {
  check_mode(reader, true)
}

fn check_mode<R: Read + Seek>(reader: &mut R, calculation: bool) -> BackendResult<()> {
  super::zip_directory::check(reader)?;
  let mut archive = zip::ZipArchive::new(reader)
    .map_err(|_| limits::invalid("Invalid or encrypted Excel archive"))?;
  if archive.len() > 512 {
    return Err(limits::error("Workbook contains too many archive entries"));
  }
  let mut inflated = 0u64;
  let mut actual_total = 0u64;
  let mut names = HashSet::new();
  for index in 0..archive.len() {
    let entry = archive
      .by_index(index)
      .map_err(|_| limits::invalid("Cannot read Excel archive entry"))?;
    let name = entry
      .name()
      .map_err(|_| limits::invalid("Invalid Excel archive entry name"))?
      .to_ascii_lowercase();
    if name.len() > 1024 || !names.insert(name.clone()) {
      return Err(limits::invalid(
        "Workbook contains ambiguous archive entries",
      ));
    }
    inflated = inflated.saturating_add(entry.size());
    if entry.size() > limits::MAX_XML_BYTES || inflated > limits::MAX_INFLATED_BYTES {
      return Err(limits::error(
        "Expanded workbook exceeds the preview memory limit",
      ));
    }
    // A bounded reader also checks actual decompressed bytes rather than
    // trusting only the archive's declared uncompressed sizes.
    let allowance = limits::MAX_XML_BYTES.min(limits::MAX_INFLATED_BYTES - actual_total);
    let mut bounded = entry.take(allowance + 1);
    if name.ends_with(".xml") || name.ends_with(".rels") {
      check_xml(BufReader::new(&mut bounded), calculation)?;
    } else {
      std::io::copy(&mut bounded, &mut std::io::sink())?;
    }
    actual_total += allowance + 1 - bounded.limit();
    if bounded.limit() == 0 {
      return Err(limits::error(
        "Expanded workbook exceeds its preview byte limit",
      ));
    }
  }
  Ok(())
}

fn check_xml<R: std::io::BufRead>(input: R, calculation: bool) -> BackendResult<()> {
  let mut reader = Reader::from_reader(input);
  let mut buffer = Vec::new();
  let mut depth = 0usize;
  let mut nodes = 0usize;
  let mut strings = 0usize;
  let mut sheets = 0usize;
  let mut formulas = 0usize;
  let mut formula_text = None;
  loop {
    buffer.clear();
    let event = reader
      .read_event_into(&mut buffer)
      .map_err(|_| limits::invalid("Invalid workbook XML"))?;
    match event {
      Event::Start(ref element) | Event::Empty(ref element) => {
        nodes += 1;
        if nodes > 1_000_000 {
          return Err(limits::error(
            "Workbook XML exceeds the preview complexity limit",
          ));
        }
        check_element(
          element,
          &mut strings,
          &mut sheets,
          &mut formulas,
          calculation,
        )?;
        if element.local_name().as_ref() == "f" {
          formula_text = Some(0usize);
        }
        if matches!(event, Event::Start(_)) {
          depth += 1;
          if depth > 64 {
            return Err(limits::error("Workbook XML is nested too deeply"));
          }
        }
      }
      Event::End(ref element) => {
        depth = depth.saturating_sub(1);
        if element.local_name().as_ref() == "f" {
          formula_text = None;
        }
      }
      Event::Text(_) | Event::CData(_) if formula_text.is_some() => {
        if let Some(bytes) = &mut formula_text {
          *bytes += buffer.len();
          if *bytes > 4096 {
            return Err(limits::error(
              "Workbook formula text exceeds the preview limit",
            ));
          }
        }
      }
      Event::DocType(_) => {
        return Err(limits::invalid(
          "Workbook XML document types are unsupported",
        ));
      }
      Event::Eof => break,
      _ => {}
    }
    if buffer.len() > 256 * 1024 {
      return Err(limits::error(
        "Workbook XML value exceeds the preview limit",
      ));
    }
  }
  Ok(())
}

fn check_element(
  element: &BytesStart<'_>,
  strings: &mut usize,
  sheets: &mut usize,
  formulas: &mut usize,
  calculation: bool,
) -> BackendResult<()> {
  let local_name = element.local_name();
  if local_name.as_ref() == "Relationship" {
    super::zip_relationship::check(element)?;
  }
  if local_name.as_ref() == "f" {
    *formulas += 1;
    if *formulas > 10_000 {
      return Err(limits::error(
        "Worksheet exceeds the 10,000 formula preview limit",
      ));
    }
  }
  if local_name.as_ref() == "si" {
    *strings += 1;
    if *strings > 100_000 {
      return Err(limits::error("Workbook contains too many shared strings"));
    }
  }
  if local_name.as_ref() == "sheet" {
    *sheets += 1;
    if *sheets > 128 {
      return Err(limits::error("Workbook has too many worksheets"));
    }
  }
  for (count, attribute) in element.attributes().enumerate() {
    if count >= 64 {
      return Err(limits::error(
        "Workbook XML element has too many attributes",
      ));
    }
    let attribute = attribute.map_err(|_| limits::invalid("Invalid workbook XML attribute"))?;
    if local_name.as_ref() == "f" {
      if attribute.key.as_ref() == "si"
        && attribute
          .value
          .parse::<usize>()
          .ok()
          .is_none_or(|index| index > 4096)
      {
        return Err(limits::error(
          "Workbook shared-formula index exceeds the preview limit",
        ));
      }
      if calculation
        && attribute.key.as_ref() == "t"
        && !matches!(attribute.value.as_ref(), "normal" | "shared")
      {
        return Err(limits::calculation_unsupported(
          "Array and data-table formulas cannot be recalculated",
        ));
      }
    }
    // Calamine reserves uniqueCount strings before reading the first cell.
    // Validate this untrusted allocation hint independently of ZIP size.
    if local_name.as_ref() == "sst" && attribute.key.as_ref() == "uniqueCount" {
      let count = attribute
        .value
        .parse::<usize>()
        .ok()
        .ok_or_else(|| limits::invalid("Invalid workbook shared-string count"))?;
      if count > 100_000 {
        return Err(limits::error(
          "Workbook shared-string count exceeds the preview limit",
        ));
      }
    }
  }
  Ok(())
}
