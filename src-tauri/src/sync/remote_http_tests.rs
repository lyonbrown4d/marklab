use super::upload_stream;
use futures_util::TryStreamExt;

#[tokio::test]
async fn streamed_upload_preserves_exact_length_and_rejects_changed_snapshots() {
  let directory = tempfile::tempdir().unwrap();
  let path = directory.path().join("snapshot");
  let content = vec![42u8; 128 * 1024 + 13];
  tokio::fs::write(&path, &content).await.unwrap();
  for (size, expected_error) in [
    (content.len() as u64, None),
    (
      content.len() as u64 - 1,
      Some(std::io::ErrorKind::InvalidData),
    ),
    (
      content.len() as u64 + 1,
      Some(std::io::ErrorKind::UnexpectedEof),
    ),
  ] {
    let file = tokio::fs::File::open(&path).await.unwrap();
    let result = upload_stream(file, size).try_collect::<Vec<_>>().await;
    match expected_error {
      Some(kind) => assert_eq!(result.unwrap_err().kind(), kind),
      None => {
        let chunks = result.unwrap();
        assert!(chunks.iter().all(|chunk| chunk.len() <= 64 * 1024));
        assert_eq!(chunks.concat(), content);
      }
    }
  }
}
