use super::factory_error;
use crate::{
    analysis::AnalysisService, database::Database, settings::SettingsStore,
    workspace::WorkspaceRegistry,
};
use fluxdi::{Error, Shared, static_module};
use std::path::PathBuf;

pub(super) struct CoreConfig {
    pub data_dir: PathBuf,
    pub exclude_engine_cache: bool,
}

static_module! {
    pub(super) struct CoreModule {
        external config: CoreConfig;
        #[scope(root)]
        async database: Database = database(config);
        #[scope(root)]
        settings: SettingsStore = settings(database);
        #[scope(root)]
        async registry: WorkspaceRegistry = registry(config, database);
        #[scope(root)]
        async analysis: AnalysisService = analysis(config, database);
    }
}

async fn database(config: Shared<CoreConfig>) -> Result<Shared<Database>, Error> {
    Database::open(&config.data_dir)
        .await
        .map(Shared::new)
        .map_err(factory_error)
}

fn settings(database: Shared<Database>) -> Result<Shared<SettingsStore>, Error> {
    Ok(Shared::new(SettingsStore::new(database.pool.clone())))
}

async fn registry(
    config: Shared<CoreConfig>,
    database: Shared<Database>,
) -> Result<Shared<WorkspaceRegistry>, Error> {
    let data_dir = config.data_dir.clone();
    let pool = database.pool.clone();
    crate::blocking::run(move || WorkspaceRegistry::with_history(&data_dir, pool))
        .await
        .map(Shared::new)
        .map_err(factory_error)
}

async fn analysis(
    config: Shared<CoreConfig>,
    database: Shared<Database>,
) -> Result<Shared<AnalysisService>, Error> {
    let service = if config.exclude_engine_cache {
        let cache = tokio::fs::canonicalize(config.data_dir.join("tauri-storage"))
            .await
            .map_err(crate::error::BackendError::from)
            .map_err(factory_error)?;
        AnalysisService::with_excluded_directory(database.pool.clone(), cache)
    } else {
        AnalysisService::new(database.pool.clone())
    };
    Ok(Shared::new(service))
}
