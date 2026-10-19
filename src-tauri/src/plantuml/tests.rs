use super::*;

const SEQUENCE: &str = "@startuml\nAlice -> Bob: 你好\nBob --> Alice: 完成\n@enduml";

#[test]
fn renders_real_uml_families_and_chinese_text() -> BackendResult<()> {
  for source in [
    SEQUENCE,
    "@startuml\nclass User\nclass Account\nUser --> Account\n@enduml",
    "@startuml\n[*] --> Ready\nReady --> [*]\n@enduml",
    "@startuml\nstart\n:Write;\nstop\n@enduml",
    "@startuml\n[Editor] --> [Backend]\n@enduml",
    "@startuml\n!define NAME Alice\nNAME -> Bob: Hello\n@enduml",
  ] {
    let diagram = render::render(source)?;
    assert_eq!(diagram.pages.len(), 1);
    assert!(diagram.pages[0].contains("<svg"));
    assert!(diagram.pages[0].contains("<text"));
  }
  let chinese = render::render(SEQUENCE)?;
  assert!(chinese.pages[0].contains("你好"));
  assert!(chinese.pages[0].contains("完成"));
  Ok(())
}

#[test]
fn renders_all_pages_instead_of_silently_dropping_pages() -> BackendResult<()> {
  let diagram =
    render::render("@startuml\nAlice -> Bob: First\nnewpage\nBob -> Alice: Second\n@enduml")?;
  assert_eq!(diagram.pages.len(), 2);
  assert!(diagram.pages[0].contains("First"));
  assert!(diagram.pages[1].contains("Second"));
  Ok(())
}

#[test]
fn rejects_invalid_or_excessive_source_and_external_includes() {
  for source in [
    "".to_owned(),
    "x".repeat(MAX_SOURCE_BYTES + 1),
    "\n".repeat(4001),
    "@startuml\n!include /etc/passwd\n@enduml".to_owned(),
    "@startuml\n!include relative.puml\n@enduml".to_owned(),
    "@startuml\n!includeurl https://example.com/private.puml\n@enduml".to_owned(),
    "@startuml\nclass User {\n@enduml".to_owned(),
  ] {
    assert!(
      render::render(&source).is_err(),
      "Unexpectedly rendered: {source}"
    );
  }
}

#[tokio::test]
async fn caches_identical_sources_with_window_and_workspace_isolation() -> BackendResult<()> {
  let service = PlantUmlService::default();
  let request = || RenderRequest {
    source: SEQUENCE.into(),
    request_id: uuid::Uuid::new_v4().to_string(),
  };
  let first = service.render("main", 1, request()).await?;
  let cached = service.render("main", 1, request()).await?;
  assert!(Arc::ptr_eq(&first, &cached));
  let another_window = service.render("second", 1, request()).await?;
  assert!(!Arc::ptr_eq(&first, &another_window));
  let another_workspace = service.render("main", 2, request()).await?;
  assert!(!Arc::ptr_eq(&first, &another_workspace));
  Ok(())
}

#[tokio::test]
async fn cancellation_is_owned_by_the_calling_window() -> BackendResult<()> {
  let service = PlantUmlService::default();
  service.cancel("main", "cancel-me")?;
  let request = || RenderRequest {
    source: SEQUENCE.into(),
    request_id: "cancel-me".into(),
  };
  let cancelled = service.render("main", 1, request()).await.err();
  assert_eq!(
    cancelled.map(|error| error.code).as_deref(),
    Some("PLANTUML_CANCELLED")
  );
  assert!(service.render("second", 1, request()).await.is_ok());
  Ok(())
}

#[tokio::test]
async fn refuses_excess_work_and_invalid_request_ids() -> BackendResult<()> {
  let service = PlantUmlService::default();
  let _occupied = service
    .queue
    .clone()
    .acquire_many_owned(16)
    .await
    .map_err(|error| BackendError::new("TEST", error.to_string()))?;
  let error = service
    .render(
      "main",
      1,
      RenderRequest {
        source: SEQUENCE.into(),
        request_id: "queued".into(),
      },
    )
    .await
    .err();
  assert_eq!(
    error.map(|error| error.code).as_deref(),
    Some("PLANTUML_BUSY")
  );
  assert!(service.cancel("main", "bad:id").is_err());
  Ok(())
}
