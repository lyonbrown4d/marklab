use super::{core::CoreConfig, factory_error};
use crate::{
  ai::AiService, assets::AssetService, database::Database, git::GitState,
  graph_layout::GraphLayoutStore, history::HistoryStore, link_preview::LinkPreviewService,
  platform::updates::UpdateService, sync::SyncService,
};
use fluxdi::{Error, Shared};
use std::path::PathBuf;
use tauri::AppHandle;

pub(super) fn defaults<T: Default + Send + Sync + 'static>() -> Result<Shared<T>, Error> {
  Ok(Shared::new(T::default()))
}

pub(super) fn history(database: Shared<Database>) -> Result<Shared<HistoryStore>, Error> {
  Ok(Shared::new(HistoryStore::new(database.pool.clone())))
}

pub(super) fn graph_layout(database: Shared<Database>) -> Result<Shared<GraphLayoutStore>, Error> {
  Ok(Shared::new(GraphLayoutStore::new(database.pool.clone())))
}

pub(super) fn graph_compute() -> Result<Shared<crate::graph_compute::GraphComputeService>, Error> {
  Ok(Shared::new(crate::graph_compute::GraphComputeService::new()))
}

pub(super) async fn ai(database: Shared<Database>) -> Result<Shared<AiService>, Error> {
  AiService::new(database.pool.clone())
    .await
    .map(Shared::new)
    .map_err(factory_error)
}

pub(super) async fn sync(database: Shared<Database>) -> Result<Shared<SyncService>, Error> {
  SyncService::new(database.pool.clone())
    .await
    .map(Shared::new)
    .map_err(factory_error)
}

pub(super) async fn preview(
  database: Shared<Database>,
  cache_dir: Shared<PathBuf>,
) -> Result<Shared<LinkPreviewService>, Error> {
  LinkPreviewService::new(database.pool.clone(), cache_dir.join("web-previews"))
    .await
    .map(Shared::new)
    .map_err(factory_error)
}

pub(super) async fn assets(config: Shared<CoreConfig>) -> Result<Shared<AssetService>, Error> {
  let data = config.data_dir.clone();
  crate::blocking::run(move || AssetService::new(&data))
    .await
    .map(Shared::new)
    .map_err(factory_error)
}

pub(super) async fn git() -> Result<Shared<GitState>, Error> {
  crate::git::initialize().await.map_err(factory_error)?;
  Ok(Shared::new(GitState::default()))
}

pub(super) fn updates(app: Shared<AppHandle>) -> Result<Shared<UpdateService>, Error> {
  Ok(Shared::new(UpdateService::new(&app)))
}
