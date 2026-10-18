use tauri::Manager;
pub fn serve(
    context: tauri::UriSchemeContext<'_, tauri::Wry>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let app = context.app_handle().clone();
    let owner = context.webview_label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let head = request.method() == tauri::http::Method::HEAD;
        if request.method() != tauri::http::Method::GET && !head {
            let response = tauri::http::Response::builder()
                .status(405)
                .header("Allow", "GET, HEAD")
                .body(Vec::new());
            if let Ok(response) = response {
                responder.respond(response);
            }
            return;
        }
        let path = request.uri().path();
        let token = path
            .strip_prefix("/v1/")
            .or_else(|| path.strip_prefix("/local/v1/"))
            .or_else(|| path.strip_prefix("/remote/v1/"))
            .filter(|token| !token.is_empty() && !token.contains('/'))
            .unwrap_or_default();
        let range = request
            .headers()
            .get("range")
            .and_then(|range| range.to_str().ok());
        let result = app
            .try_state::<crate::assets::AssetService>()
            .ok_or_else(|| {
                crate::error::BackendError::new(
                    "ASSET_UNAVAILABLE",
                    "Preview service is initializing",
                )
            })
            .and_then(|service| service.serve(&owner, token, range, head));
        let response = match result {
            Ok((bytes, mime, content_range, size)) => {
                let html = mime
                    .split(';')
                    .next()
                    .is_some_and(|mime| mime == "text/html");
                let mut builder = tauri::http::Response::builder()
                    .status(if content_range.is_some() { 206 } else { 200 })
                    .header("Content-Type", mime)
                    .header("Content-Length", size.to_string())
                    .header("Accept-Ranges", "bytes")
                    .header("Cache-Control", "private, max-age=60")
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Access-Control-Allow-Origin", "*");
                builder = builder.header(
                    "Access-Control-Expose-Headers",
                    "Content-Length, Content-Range, Accept-Ranges",
                );
                if html {
                    builder=builder.header("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'");
                }
                if let Some(range) = content_range {
                    builder = builder.header("Content-Range", range);
                }
                builder.body(if head { Vec::new() } else { bytes })
            }
            Err(error) => tauri::http::Response::builder()
                .status(if error.code == "INVALID_RANGE" {
                    416
                } else {
                    403
                })
                .header("Content-Type", "text/plain")
                .header("Cache-Control", "no-store")
                .body(if head {
                    Vec::new()
                } else {
                    error.message.into_bytes()
                }),
        };
        if let Ok(response) = response {
            responder.respond(response);
        }
    });
}
