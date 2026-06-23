use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceParams {
  pub(crate) workspace_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceOpenParams {
  pub(crate) workspace_id: String,
  pub(crate) index_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceRebuildParams {
  pub(crate) workspace_id: String,
  pub(crate) documents: Vec<SearchDocument>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceDocumentParams {
  pub(crate) workspace_id: String,
  pub(crate) document: SearchDocument,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspacePathParams {
  pub(crate) workspace_id: String,
  pub(crate) path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspacePrefixParams {
  pub(crate) workspace_id: String,
  pub(crate) prefix: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSearchParams {
  pub(crate) workspace_id: String,
  pub(crate) query: String,
  pub(crate) limit: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownExtractParams {
  pub(crate) path: String,
  pub(crate) content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownDocumentParams {
  pub(crate) path: String,
  pub(crate) content: String,
  pub(crate) version: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownPathParams {
  pub(crate) path: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SearchDocument {
  pub(crate) path: String,
  pub(crate) title: String,
  pub(crate) content: String,
}

#[derive(Debug)]
pub(crate) struct EngineError {
  pub(crate) code: i32,
  pub(crate) message: String,
}

impl EngineError {
  pub(crate) fn invalid_params(message: &str) -> Self {
    Self {
      code: -32602,
      message: message.to_string(),
    }
  }

  pub(crate) fn method_not_found() -> Self {
    Self {
      code: -32601,
      message: "Method not found".to_string(),
    }
  }

  pub(crate) fn internal(message: impl Into<String>) -> Self {
    Self {
      code: -32603,
      message: message.into(),
    }
  }
}
