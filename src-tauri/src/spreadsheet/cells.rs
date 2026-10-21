use super::limits;
use calamine::DataRef;
use serde::Serialize;

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(untagged)]
pub enum CellValue {
  Text(String),
  Number(f64),
  Boolean(bool),
  Empty,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
pub struct SpreadsheetCell {
  pub value: CellValue,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub formula: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub format: Option<String>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Calculation {
  pub status: CalculationStatus,
  pub warnings: Vec<String>,
  pub error_count: usize,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum CalculationStatus {
  Cached,
  Recalculated,
}

impl Default for Calculation {
  fn default() -> Self {
    Self {
      status: CalculationStatus::Cached,
      warnings: Vec::new(),
      error_count: 0,
    }
  }
}

impl Default for SpreadsheetCell {
  fn default() -> Self {
    Self {
      value: CellValue::Empty,
      formula: None,
      format: None,
    }
  }
}

impl SpreadsheetCell {
  pub fn weight(&self) -> usize {
    96 + match &self.value {
      CellValue::Text(value) => value.len(),
      _ => 0,
    } + self.formula.as_ref().map_or(0, String::len)
      + self.format.as_ref().map_or(0, String::len)
  }
}

pub fn from_data(
  value: &DataRef<'_>,
  formula: Option<&str>,
  bytes: &mut usize,
  truncated: &mut bool,
) -> SpreadsheetCell {
  let format = value_format(value).unwrap_or_else(|| "General".into());
  let value = match value {
    DataRef::Empty => CellValue::Empty,
    DataRef::Int(value) => CellValue::Number(*value as f64),
    DataRef::Float(value) if value.is_finite() => CellValue::Number(*value),
    DataRef::Bool(value) => CellValue::Boolean(*value),
    DataRef::DateTime(value) => CellValue::Number(date_serial(value)),
    DataRef::String(value) | DataRef::DateTimeIso(value) | DataRef::DurationIso(value) => {
      CellValue::Text(limits::append_cell(value, bytes, truncated))
    }
    DataRef::SharedString(value) => CellValue::Text(limits::append_cell(value, bytes, truncated)),
    other => CellValue::Text(limits::append_cell(
      &super::workbook::display(other),
      bytes,
      truncated,
    )),
  };
  SpreadsheetCell {
    value,
    formula: formula.map(|formula| limits::append_cell(&format!("={formula}"), bytes, truncated)),
    format: Some(format),
  }
}

fn value_format(value: &DataRef<'_>) -> Option<String> {
  if let DataRef::DateTime(value) = value {
    if !value.is_datetime() {
      return Some("[h]:mm:ss".into());
    }
    let (_, _, _, hour, minute, second, millisecond) = value.to_ymd_hms_milli();
    return Some(if (hour, minute, second, millisecond) == (0, 0, 0, 0) {
      "yyyy-mm-dd".into()
    } else {
      "yyyy-mm-dd hh:mm:ss.000".into()
    });
  }
  None
}

pub fn date_serial(value: &calamine::ExcelDateTime) -> f64 {
  if !value.is_datetime() {
    return value.as_f64();
  }
  let (year, month, day, hour, minute, second, milli) = value.to_ymd_hms_milli();
  let date = chrono::NaiveDate::from_ymd_opt(year as i32, month as u32, day as u32);
  let epoch = chrono::NaiveDate::from_ymd_opt(1899, 12, 30);
  match date.zip(epoch) {
    Some((date, epoch)) => {
      let mut days = date.signed_duration_since(epoch).num_days() as f64;
      if (year, month, day) < (1900, 3, 1) {
        days -= 1.0;
      }
      days
        + (hour as f64 * 3600.0 + minute as f64 * 60.0 + second as f64 + milli as f64 / 1000.0)
          / 86400.0
    }
    None => value.as_f64(),
  }
}
