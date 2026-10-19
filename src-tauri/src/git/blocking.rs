use crate::error::BackendResult;
pub async fn filesystem<T: Send + 'static>(
  work: impl FnOnce() -> BackendResult<T> + Send + 'static,
) -> BackendResult<T> {
  crate::blocking::run(work).await
}
