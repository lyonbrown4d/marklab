use crate::error::{BackendError, BackendResult};
use std::net::IpAddr;
use unicode_normalization::UnicodeNormalization;
use url::Url;
pub fn invalid(message: &str) -> BackendError {
    BackendError::new("INVALID_SYNC_PATH", message)
}
pub fn identifier(value: &str, max: usize) -> BackendResult<()> {
    if value.is_empty()
        || value.len() > max
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
    {
        return Err(invalid("Invalid sync identifier"));
    }
    Ok(())
}
pub fn decode(value: &str) -> BackendResult<String> {
    let mut bytes = Vec::with_capacity(value.len());
    let source = value.as_bytes();
    let mut index = 0;
    while index < source.len() {
        if source[index] == b'%' {
            if index + 2 >= source.len() {
                return Err(invalid("Invalid percent encoding"));
            }
            let high = (source[index + 1] as char)
                .to_digit(16)
                .ok_or_else(|| invalid("Invalid percent encoding"))?;
            let low = (source[index + 2] as char)
                .to_digit(16)
                .ok_or_else(|| invalid("Invalid percent encoding"))?;
            let byte = (high * 16 + low) as u8;
            bytes.push(byte);
            index += 3;
        } else {
            bytes.push(source[index]);
            index += 1;
        }
    }
    String::from_utf8(bytes).map_err(|_| invalid("Invalid path encoding"))
}
fn safe_remote_segment(segment: &str) -> BackendResult<()> {
    let mut decoded = segment.to_string();
    for _ in 0..3 {
        if decoded == "."
            || decoded == ".."
            || decoded
                .chars()
                .any(|c| c == '/' || c == '\\' || c.is_control())
        {
            return Err(invalid("Remote path escapes configured directory"));
        }
        let next = decode(&decoded)?;
        if next == decoded {
            return Ok(());
        }
        decoded = next;
    }
    Err(invalid("Remote path contains recursive encoding"))
}
pub fn remote_path(value: &str) -> BackendResult<String> {
    if value.len() > 4096 || value.chars().any(|c| c == '\\' || c.is_control()) {
        return Err(invalid("Invalid remote path"));
    }
    let segments = value
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    for segment in &segments {
        safe_remote_segment(segment)?;
    }
    Ok(segments.join("/"))
}
pub fn sync_path(value: &str) -> BackendResult<String> {
    if value.is_empty() || value.len() > 4096 || value.starts_with('/') || value.starts_with('\\') {
        return Err(invalid("Sync path must be relative"));
    }
    let value = value.replace('\\', "/").nfc().collect::<String>();
    for segment in value.split('/') {
        let lower = segment.to_lowercase();
        let stem = lower.split('.').next().unwrap_or_default();
        let reserved = ["con", "prn", "aux", "nul"].contains(&stem)
            || (stem.len() == 4
                && (stem.starts_with("com") || stem.starts_with("lpt"))
                && stem.as_bytes()[3].is_ascii_digit()
                && stem.as_bytes()[3] != b'0');
        if segment.is_empty()
            || segment == "."
            || segment == ".."
            || segment.ends_with([' ', '.'])
            || segment
                .chars()
                .any(|c| c.is_control() || "<>:\"|?*".contains(c))
            || [".git", ".marklab-sync", "node_modules"].contains(&lower.as_str())
            || reserved
        {
            return Err(invalid("Sync path is unsafe or not portable"));
        }
    }
    Ok(value)
}
pub fn validate_endpoint(
    value: &str,
    allow_insecure: bool,
    base_path: Option<&str>,
) -> BackendResult<(String, String)> {
    if value.len() > 2048 || value.chars().any(char::is_control) {
        return Err(invalid("Invalid WebDAV endpoint"));
    }
    let authority = value
        .find("://")
        .map(|index| index + 3)
        .ok_or_else(|| invalid("Invalid WebDAV endpoint"))?;
    if let Some(start) = value[authority..].find('/') {
        remote_path(
            value[authority + start..]
                .split(['?', '#'])
                .next()
                .unwrap_or_default(),
        )?;
    }
    let url = Url::parse(value).map_err(|_| invalid("Invalid WebDAV endpoint"))?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host_str().is_none()
    {
        return Err(invalid(
            "WebDAV endpoint cannot contain credentials, queries or fragments",
        ));
    }
    let local = url.host_str().is_some_and(|host| {
        host.eq_ignore_ascii_case("localhost")
            || host
                .trim_matches(['[', ']'])
                .parse::<IpAddr>()
                .is_ok_and(|ip| match ip {
                    IpAddr::V4(ip) => ip.is_private() || ip.is_loopback(),
                    IpAddr::V6(ip) => ip.is_loopback() || (ip.segments()[0] & 0xfe00) == 0xfc00,
                })
    });
    if url.scheme() != "https" && !(url.scheme() == "http" && allow_insecure && local) {
        return Err(invalid(
            "WebDAV requires HTTPS or explicitly allowed local HTTP",
        ));
    }
    if base_path.is_some() && url.path() != "/" {
        return Err(invalid("Specify the WebDAV base path only once"));
    }
    let raw = base_path.unwrap_or(url.path());
    let decoded = decode(raw)?;
    let base = remote_path(&decoded)?;
    Ok((
        url.origin().ascii_serialization(),
        if base.is_empty() {
            "/".into()
        } else {
            format!("/{base}")
        },
    ))
}
