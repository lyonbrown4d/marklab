use zbus::Type;

#[test]
fn notify_body_matches_the_freedesktop_wire_signature() {
  // A Rust fixed array is encoded as a D-Bus struct, not the required string array.
  assert_eq!(super::NotifyBody::SIGNATURE.to_string(), "(susssasa{sv}i)");
  let message = super::NativeMessage {
    id: "id".into(),
    token: "token".into(),
    title: "Title".into(),
    body: "Body".into(),
  };
  let body = super::notify_body(&message, "Marklab", true);
  assert_eq!(body.5, ["default", "Open Marklab"]);
  assert_eq!(body.1, 0);
  assert_eq!(body.2, "marklab-desktop");
  assert_eq!(
    body
      .6
      .get("desktop-entry")
      .and_then(|value| <&str>::try_from(value).ok()),
    Some("Marklab")
  );
  assert_eq!(body.7, -1);
}
#[test]
fn body_is_plain_text_even_when_server_supports_markup() {
  let message = super::NativeMessage {
    id: "id".into(),
    token: "token".into(),
    title: "Title".into(),
    body: "PDF a<b&c>.pdf failed".into(),
  };
  assert_eq!(
    super::notify_body(&message, "app.marklab", true).4,
    "PDF a&lt;b&amp;c&gt;.pdf failed"
  );
  assert_eq!(
    super::notify_body(&message, "app.marklab", false).4,
    "PDF a<b&c>.pdf failed"
  );
}
