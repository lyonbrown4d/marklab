use super::{
    AppPaths,
    core::{CoreConfig, CoreModule},
    factories, graph_error, take,
};
use crate::{
    ai::AiService,
    analysis::AnalysisService,
    assets::AssetService,
    database::Database,
    error::BackendResult,
    export::ExportService,
    git::GitState,
    graph_compute::GraphComputeService,
    graph_layout::GraphLayoutStore,
    history::HistoryStore,
    language::LanguageService,
    link_preview::LinkPreviewService,
    plantuml::PlantUmlService,
    platform::{clipboard::RichClipboard, save_paths::SavePathGrants, updates::UpdateService},
    settings::SettingsStore,
    sync::SyncService,
    terminal::TerminalState,
    web_tabs::WebTabs,
    workspace::WorkspaceRegistry,
};
use fluxdi::{Shared, static_module};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

static_module! {
    struct DesktopModule {
        import core: crate::composition::core::CoreModule {
            config: CoreConfig;
            async database: Database;
            async settings: SettingsStore;
            async registry: WorkspaceRegistry;
            async analysis: AnalysisService;
        };
        external app: AppHandle;
        external cache_dir: PathBuf;
        #[scope(root)]
        history: HistoryStore = factories::history(database);
        #[scope(root)]
        graph_layout: GraphLayoutStore = factories::graph_layout(database);
        #[scope(root)]
        graph_compute: GraphComputeService = factories::graph_compute();
        #[scope(root)]
        async ai: AiService = factories::ai(database);
        #[scope(root)]
        async sync: SyncService = factories::sync(database);
        #[scope(root)]
        async preview: LinkPreviewService = factories::preview(database, cache_dir);
        #[scope(root)]
        async assets: AssetService = factories::assets(config);
        #[scope(root)]
        async git: GitState = factories::git();
        #[scope(root)]
        language: LanguageService = factories::defaults::<LanguageService>();
        #[scope(root)]
        plantuml: PlantUmlService = factories::defaults::<PlantUmlService>();
        #[scope(root)]
        web_tabs: WebTabs = factories::defaults::<WebTabs>();
        #[scope(root)]
        terminal: TerminalState = factories::defaults::<TerminalState>();
        #[scope(root)]
        save_paths: SavePathGrants = factories::defaults::<SavePathGrants>();
        #[scope(root)]
        clipboard: RichClipboard = factories::defaults::<RichClipboard>();
        #[scope(root)]
        export: ExportService = factories::defaults::<ExportService>();
        #[scope(root)]
        updates: UpdateService = factories::updates(app);
    }
}

pub(crate) struct DesktopServices {
    pub settings: SettingsStore,
    database: Database,
    registry: WorkspaceRegistry,
    analysis: AnalysisService,
    history: HistoryStore,
    graph_layout: GraphLayoutStore,
    graph_compute: GraphComputeService,
    ai: AiService,
    sync: SyncService,
    preview: LinkPreviewService,
    assets: AssetService,
    git: GitState,
    language: LanguageService,
    plantuml: PlantUmlService,
    web_tabs: WebTabs,
    terminal: TerminalState,
    save_paths: SavePathGrants,
    clipboard: RichClipboard,
    export: ExportService,
    updates: UpdateService,
}

impl DesktopServices {
    pub async fn open(app: &AppHandle) -> BackendResult<Self> {
        let paths = AppPaths::resolve(app).await?;
        let core = CoreModule::new(Shared::new(CoreConfig {
            data_dir: paths.data_dir,
            exclude_engine_cache: false,
        }));
        // Imports preserve provider identity; the shared context also preserves
        // root instances, including the single SQLite pool used by every service.
        let graph = DesktopModule::new(
            core.clone(),
            Shared::new(app.clone()),
            Shared::new(paths.cache_dir),
        )
        .in_context(core.injector());
        let database = graph.database().await.map_err(graph_error)?;
        let settings = graph.settings().await.map_err(graph_error)?;
        let registry = graph.registry().await.map_err(graph_error)?;
        let analysis = graph.analysis().await.map_err(graph_error)?;
        let history = graph.history().await.map_err(graph_error)?;
        let graph_layout = graph.graph_layout().await.map_err(graph_error)?;
        let graph_compute = graph.graph_compute().map_err(graph_error)?;
        let git = graph.git().await.map_err(graph_error)?;
        let ai = graph.ai().await.map_err(graph_error)?;
        let sync = graph.sync().await.map_err(graph_error)?;
        let preview = graph.preview().await.map_err(graph_error)?;
        let assets = graph.assets().await.map_err(graph_error)?;
        let language = graph.language().map_err(graph_error)?;
        let plantuml = graph.plantuml().map_err(graph_error)?;
        let web_tabs = graph.web_tabs().map_err(graph_error)?;
        let terminal = graph.terminal().map_err(graph_error)?;
        let save_paths = graph.save_paths().map_err(graph_error)?;
        let clipboard = graph.clipboard().map_err(graph_error)?;
        let export = graph.export().map_err(graph_error)?;
        let updates = graph.updates().map_err(graph_error)?;
        // Transfer the actual services, with their original caches and locks, to
        // Tauri. A graph ownership error returns before any managed state changes.
        drop(graph);
        drop(core);
        Ok(Self {
            settings: take(settings)?,
            database: take(database)?,
            registry: take(registry)?,
            analysis: take(analysis)?,
            history: take(history)?,
            graph_layout: take(graph_layout)?,
            graph_compute: take(graph_compute)?,
            ai: take(ai)?,
            sync: take(sync)?,
            preview: take(preview)?,
            assets: take(assets)?,
            git: take(git)?,
            language: take(language)?,
            plantuml: take(plantuml)?,
            web_tabs: take(web_tabs)?,
            terminal: take(terminal)?,
            save_paths: take(save_paths)?,
            clipboard: take(clipboard)?,
            export: take(export)?,
            updates: take(updates)?,
        })
    }

    pub fn publish(self, app: &AppHandle) {
        app.manage(self.settings);
        app.manage(self.database);
        app.manage(self.registry);
        app.manage(self.analysis);
        app.manage(self.history);
        app.manage(self.graph_layout);
        app.manage(self.graph_compute);
        app.manage(self.ai);
        app.manage(self.sync);
        app.manage(self.preview);
        app.manage(self.assets);
        app.manage(self.git);
        app.manage(self.language);
        app.manage(self.plantuml);
        app.manage(self.web_tabs);
        app.manage(self.terminal);
        app.manage(self.save_paths);
        app.manage(self.clipboard);
        app.manage(self.export);
        app.manage(self.updates);
    }
}
