use marklab_knowledge_engine_core::{
  WorkspaceMarkdownLink, WorkspaceMarkdownSymbol, WorkspaceSearchHighlight, WorkspaceSearchResult,
};
use marklab_knowledge_grpc_api::v1::{
  markdown_service_server::MarkdownService, search_service_server::SearchService,
  GetDocumentSymbolsRequest, GetDocumentSymbolsResponse, GetLinksRequest, GetLinksResponse,
  MarkdownDocumentSymbol, MarkdownLink, Position, Range, SearchHighlight, SearchRequest,
  SearchResponse, SearchResult,
};
use tonic::{Request, Response, Status};

use crate::grpc_services::{GrpcStream, KnowledgeGrpcService};

const DEFAULT_SEARCH_LIMIT: usize = 20;
const MAX_SEARCH_LIMIT: usize = 100;

#[tonic::async_trait]
impl MarkdownService for KnowledgeGrpcService {
  async fn get_document_symbols(
    &self,
    request: Request<GetDocumentSymbolsRequest>,
  ) -> Result<Response<GetDocumentSymbolsResponse>, Status> {
    let request = request.into_inner();
    let symbols = self
      .lock_engine()?
      .document_symbols(&request.document_id)
      .into_iter()
      .map(markdown_symbol_to_proto)
      .collect();

    Ok(Response::new(GetDocumentSymbolsResponse { symbols }))
  }

  async fn get_links(
    &self,
    request: Request<GetLinksRequest>,
  ) -> Result<Response<GetLinksResponse>, Status> {
    let request = request.into_inner();
    let links = self
      .lock_engine()?
      .links(&request.document_id)
      .into_iter()
      .map(markdown_link_to_proto)
      .collect();

    Ok(Response::new(GetLinksResponse { links }))
  }
}

#[tonic::async_trait]
impl SearchService for KnowledgeGrpcService {
  type SearchStream = GrpcStream<SearchResponse>;

  async fn search(
    &self,
    request: Request<SearchRequest>,
  ) -> Result<Response<Self::SearchStream>, Status> {
    let request = request.into_inner();
    let limit = search_limit(request.limit);
    let results = self
      .lock_engine()?
      .search(&request.query, limit)
      .map_err(|error| Status::internal(format!("workspace search failed: {error}")))?
      .into_iter()
      .map(search_result_to_proto)
      .collect();
    let response = SearchResponse {
      results,
      done: true,
    };

    Ok(Response::new(
      Box::pin(tokio_stream::iter(std::iter::once(Ok(response)))) as Self::SearchStream,
    ))
  }
}

fn markdown_symbol_to_proto(symbol: WorkspaceMarkdownSymbol) -> MarkdownDocumentSymbol {
  MarkdownDocumentSymbol {
    name: symbol.name,
    kind: symbol.kind,
    level: symbol.level,
    slug: symbol.slug,
    range: Some(point_range(symbol.line, symbol.column)),
  }
}

fn markdown_link_to_proto(link: WorkspaceMarkdownLink) -> MarkdownLink {
  MarkdownLink {
    source_document_id: link.source_document_id,
    text: link.text,
    target: link.target,
    range: Some(point_range(link.line, link.column)),
    is_external: link.is_external,
  }
}

fn search_result_to_proto(result: WorkspaceSearchResult) -> SearchResult {
  SearchResult {
    document_id: result.document_id,
    path: result.path,
    title: result.title,
    line: result.line,
    column: result.column,
    end_column: result.end_column,
    snippet: result.snippet,
    snippet_highlights: result
      .snippet_highlights
      .into_iter()
      .map(search_highlight_to_proto)
      .collect(),
    score: result.score,
  }
}

fn search_highlight_to_proto(highlight: WorkspaceSearchHighlight) -> SearchHighlight {
  SearchHighlight {
    start: highlight.start,
    end: highlight.end,
  }
}

fn point_range(line: usize, column: usize) -> Range {
  let line = saturating_u32(line.saturating_sub(1));
  let character = saturating_u32(column.saturating_sub(1));
  let position = Position { line, character };

  Range {
    start: Some(position.clone()),
    end: Some(position),
  }
}

fn search_limit(limit: u32) -> usize {
  if limit == 0 {
    DEFAULT_SEARCH_LIMIT
  } else {
    (limit as usize).min(MAX_SEARCH_LIMIT)
  }
}

fn saturating_u32(value: usize) -> u32 {
  value.min(u32::MAX as usize) as u32
}
