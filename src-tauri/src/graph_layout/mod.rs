mod compute_commands;
#[cfg(test)]
mod tests;
mod types;
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
  database::workspace_key,
  error::{BackendError, BackendResult},
  workspace::{RootInfo, WorkspaceRegistry},
};
pub use compute_commands::*;
use sqlx::{Row, SqlitePool};
use tauri::State;
pub use types::*;

pub struct GraphLayoutStore {
  pool: SqlitePool,
}
impl GraphLayoutStore {
  pub fn new(pool: SqlitePool) -> Self {
    Self { pool }
  }
  pub async fn get(
    &self,
    root: &RootInfo,
    request: GraphLayoutRequest,
  ) -> BackendResult<GraphLayoutResult> {
    request.validate()?;
    let key = workspace_key(&root.kind, &root.path)?;
    let mut transaction = self.pool.begin().await?;
    let row = sqlx::query("SELECT graph_revision,engine_version,mode,viewport_json FROM graph_layouts WHERE workspace_key=? AND layout_key=?")
            .bind(&key).bind(&request.layout_key).fetch_optional(&mut *transaction).await?;
    let Some(row) = row else {
      return Ok(GraphLayoutResult {
        r#match: "miss",
        nodes: Vec::new(),
        viewport: None,
      });
    };
    let exact = row.get::<String, _>("graph_revision") == request.graph_revision
      && row.get::<String, _>("engine_version") == request.engine_version
      && row.get::<String, _>("mode") == request.mode;
    let values: Vec<String> = sqlx::query_scalar(
      "SELECT value_json FROM graph_nodes WHERE workspace_key=? AND layout_key=? ORDER BY position",
    )
    .bind(&key)
    .bind(&request.layout_key)
    .fetch_all(&mut *transaction)
    .await?;
    let nodes = values
      .into_iter()
      .map(|value| serde_json::from_str(&value).map_err(json_error))
      .collect::<BackendResult<Vec<_>>>()?;
    let viewport = if exact {
      row
        .get::<Option<String>, _>("viewport_json")
        .map(|value| serde_json::from_str(&value).map_err(json_error))
        .transpose()?
    } else {
      None
    };
    transaction.commit().await?;
    Ok(GraphLayoutResult {
      r#match: if exact { "exact" } else { "stale" },
      nodes,
      viewport,
    })
  }
  pub async fn save(&self, root: &RootInfo, value: GraphLayoutSave) -> BackendResult<()> {
    value.validate()?;
    let key = workspace_key(&root.kind, &root.path)?;
    let mut transaction = self.pool.begin().await?;
    let viewport = value
      .viewport
      .map(|viewport| serde_json::to_string(&viewport).map_err(json_error))
      .transpose()?;
    sqlx::query("INSERT INTO graph_layouts(workspace_key,layout_key,graph_revision,engine_version,mode,viewport_json) VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_key,layout_key) DO UPDATE SET graph_revision=excluded.graph_revision,engine_version=excluded.engine_version,mode=excluded.mode,viewport_json=excluded.viewport_json")
            .bind(&key).bind(&value.layout_key).bind(value.graph_revision).bind(value.engine_version).bind(value.mode).bind(viewport).execute(&mut *transaction).await?;
    sqlx::query("DELETE FROM graph_nodes WHERE workspace_key=? AND layout_key=?")
      .bind(&key)
      .bind(&value.layout_key)
      .execute(&mut *transaction)
      .await?;
    // Keep each batch below SQLite's bind limit without allocating a second full node list.
    for (offset, chunk) in value.nodes.chunks(100).enumerate() {
      let mut query = sqlx::QueryBuilder::new(
        "INSERT INTO graph_nodes(workspace_key,layout_key,node_id,position,value_json) ",
      );
      let rows = chunk
        .iter()
        .enumerate()
        .map(|(index, node)| {
          Ok((
            index,
            node,
            serde_json::to_string(node).map_err(json_error)?,
          ))
        })
        .collect::<BackendResult<Vec<_>>>()?;
      query.push_values(rows, |mut row, (index, node, json)| {
        row
          .push_bind(&key)
          .push_bind(&value.layout_key)
          .push_bind(&node.id)
          .push_bind((offset * 100 + index) as i64)
          .push_bind(json);
      });
      query.build().execute(&mut *transaction).await?;
    }
    transaction.commit().await?;
    Ok(())
  }
}
fn json_error(error: serde_json::Error) -> BackendError {
  BackendError::new("invalid_graph_data", error.to_string())
}
#[tauri::command]
pub async fn fs_get_workspace_graph_layout(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, GraphLayoutStore>,
  request: GraphLayoutRequest,
) -> BackendResult<GraphLayoutResult> {
  let workspace = registry.get(window.label())?;
  store.get(&workspace.root_info(), request).await
}
#[tauri::command]
pub async fn fs_save_workspace_graph_layout(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, GraphLayoutStore>,
  request: GraphLayoutSave,
) -> BackendResult<()> {
  let workspace = registry.get(window.label())?;
  store.save(&workspace.root_info(), request).await
}
