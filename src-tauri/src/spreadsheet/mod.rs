//! Bounded, read-only spreadsheet previews. Parsing remains on native workers.
mod calculate;
mod calculation_safety;
mod cells;
pub mod commands;
mod csv;
mod csv_guard;
#[cfg(test)]
mod fixtures;
mod input;
mod limits;
mod shared_formulas;
#[cfg(test)]
mod tests;
mod workbook;
mod zip_directory;
mod zip_preflight;
mod zip_relationship;

use crate::error::{BackendError, BackendResult};
use moka::sync::Cache;
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

#[derive(Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadPageRequest {
  pub path: String,
  #[serde(default)]
  pub source: Option<String>,
  #[serde(default)]
  pub asset_url: Option<String>,
  #[serde(default)]
  pub sheet: Option<String>,
  #[serde(default)]
  pub offset: Option<usize>,
  #[serde(default)]
  pub limit: Option<usize>,
  #[serde(default)]
  pub recalculate: bool,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SpreadsheetPage {
  pub sheets: Vec<String>,
  pub sheet: String,
  pub columns: usize,
  pub total_rows: usize,
  pub offset: usize,
  pub rows: Vec<Vec<String>>,
  pub truncated: bool,
  pub cells: Vec<Vec<cells::SpreadsheetCell>>,
  pub calculation: cells::Calculation,
}

impl SpreadsheetPage {
  fn weight(&self) -> u32 {
    let rows = self.rows.iter().fold(0usize, |sum, row| {
      sum.saturating_add(24 + row.iter().map(|cell| 24 + cell.len()).sum::<usize>())
    });
    (rows
      + self
        .sheets
        .iter()
        .map(|sheet| 24 + sheet.len())
        .sum::<usize>()
      + 256)
      .saturating_add(
        self
          .cells
          .iter()
          .flatten()
          .map(cells::SpreadsheetCell::weight)
          .sum::<usize>(),
      )
      .min(u32::MAX as usize) as u32
  }
}

pub struct SpreadsheetService {
  cache: Cache<String, Arc<SpreadsheetPage>>,
  workers: Arc<Semaphore>,
  queue: Arc<Semaphore>,
}

impl Default for SpreadsheetService {
  fn default() -> Self {
    Self {
      cache: Cache::builder()
        .name("spreadsheet-pages")
        .max_capacity(16 * 1024 * 1024)
        .weigher(|key: &String, page: &Arc<SpreadsheetPage>| {
          page.weight().saturating_add(key.len() as u32)
        })
        .time_to_idle(Duration::from_secs(300))
        .build(),
      workers: Arc::new(Semaphore::new(2)),
      queue: Arc::new(Semaphore::new(8)),
    }
  }
}

impl SpreadsheetService {
  async fn permits(&self) -> BackendResult<(OwnedSemaphorePermit, OwnedSemaphorePermit)> {
    let queued = self.queue.clone().try_acquire_owned().map_err(|_| {
      BackendError::new(
        "SPREADSHEET_BUSY",
        "Too many spreadsheet previews; try again",
      )
    })?;
    let worker = self.workers.clone().acquire_owned().await.map_err(|_| {
      BackendError::new("TASK_STOPPED", "Spreadsheet preview worker is unavailable")
    })?;
    Ok((queued, worker))
  }

  fn read(
    &self,
    owner: &str,
    workspace: &crate::workspace::Workspace,
    assets: &crate::assets::AssetService,
    request: ReadPageRequest,
  ) -> BackendResult<SpreadsheetPage> {
    limits::validate(&request)?;
    workspace.ensure_active()?;
    let prepared = input::prepare(owner, workspace, assets, &request)?;
    let key = serde_json::to_string(&(
      owner,
      workspace.generation,
      &request.path,
      &prepared.identity,
      &request.sheet,
      request.offset.unwrap_or(0),
      request.limit.unwrap_or(limits::DEFAULT_ROWS),
      request.recalculate,
    ))?;
    if let Some(page) = self.cache.get(&key) {
      return Ok((*page).clone());
    }
    let page = match prepared.format {
      input::Format::Csv | input::Format::Tsv => csv::read(prepared, &request)?,
      input::Format::Xlsx => workbook::read(prepared, &request)?,
    };
    workspace.ensure_active()?;
    self.cache.insert(key, Arc::new(page.clone()));
    Ok(page)
  }
}
