use crate::error::{BackendError, BackendResult};
use git_lfs_api::{Auth, Client};
use std::{
  io::{Read, Write},
  time::Duration,
};
use url::Url;

pub(super) fn error(message: &str) -> BackendError {
  BackendError::new("git_lfs_failed", message)
}

pub(super) fn validate_url(value: &str) -> BackendResult<Url> {
  let url = Url::parse(value).map_err(|_| error("Git LFS requires an absolute HTTPS endpoint"))?;
  let test_http = cfg!(test)
    && url.scheme() == "http"
    && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
  if (url.scheme() != "https" && !test_http)
    || url.host_str().is_none()
    || !url.username().is_empty()
    || url.password().is_some()
    || url.fragment().is_some()
  {
    return Err(error(
      "Git LFS requires HTTPS URLs without embedded credentials or fragments",
    ));
  }
  Ok(url)
}

fn configured(config: &git2::Config, key: &str) -> BackendResult<Option<String>> {
  match config.get_string(key) {
    Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
    Ok(_) => Err(error("Git LFS endpoint configuration is empty")),
    Err(value) if value.code() == git2::ErrorCode::NotFound => Ok(None),
    Err(_) => Err(error("Git LFS configuration could not be read")),
  }
}

fn check_adapters(config: &git2::Config) -> BackendResult<()> {
  let mut entries = config.entries(None)?;
  while let Some(entry) = entries.next() {
    let entry = entry?;
    if entry.name().is_ok_and(|name| {
      name.starts_with("lfs.customtransfer.")
        || name.starts_with("lfs.extension.")
        || name == "lfs.standalonetransferagent"
    }) {
      return Err(error(
        "This repository requires a custom Git LFS adapter or extension; configure the standard HTTPS basic transfer",
      ));
    }
  }
  Ok(())
}

fn file_endpoint(
  repo: &git2::Repository,
  key: &str,
  upload: bool,
) -> BackendResult<Option<String>> {
  let bytes = if let Some(root) = repo.workdir() {
    let path = root.join(".lfsconfig");
    if std::fs::symlink_metadata(&path).is_ok_and(|metadata| !metadata.is_file()) {
      return Err(error("Git LFS configuration must be a regular file"));
    }
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
      use std::os::unix::fs::OpenOptionsExt;
      options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    match options.open(path) {
      Ok(file) => {
        if !file.metadata()?.is_file() {
          return Err(error("Git LFS configuration must be a regular file"));
        }
        let mut bytes = Vec::new();
        file.take(16 * 1024 + 1).read_to_end(&mut bytes)?;
        if bytes.len() > 16 * 1024 {
          return Err(error("Git LFS configuration exceeds 16 KiB"));
        }
        Some(bytes)
      }
      Err(value) if value.kind() == std::io::ErrorKind::NotFound => None,
      Err(value) => return Err(value.into()),
    }
  } else {
    None
  };
  // A clone may request a filter before .lfsconfig has been checked out.
  let bytes = match bytes {
    Some(bytes) => bytes,
    None => {
      let Ok(head) = repo.head().and_then(|head| head.peel_to_tree()) else {
        return Ok(None);
      };
      let Ok(entry) = head.get_path(std::path::Path::new(".lfsconfig")) else {
        return Ok(None);
      };
      let (size, kind) = repo.odb()?.read_header(entry.id())?;
      if size > 16 * 1024 || kind != git2::ObjectType::Blob || entry.filemode() == 0o120000 {
        return Err(error(
          "Git LFS configuration must be a regular file smaller than 16 KiB",
        ));
      }
      repo.find_blob(entry.id())?.content().to_vec()
    }
  };
  // Includes can escape the bounded file into arbitrary local configuration.
  if String::from_utf8_lossy(&bytes).lines().any(|line| {
    line.trim_start().strip_prefix('[').is_some_and(|section| {
      section
        .trim_start()
        .to_ascii_lowercase()
        .starts_with("include")
    })
  }) {
    return Err(error(
      "Git LFS configuration includes are unsupported; set lfs.url directly",
    ));
  }
  let mut file = tempfile::NamedTempFile::new()?;
  file.write_all(&bytes)?;
  let config =
    git2::Config::open(file.path()).map_err(|_| error("Git LFS configuration is invalid"))?;
  // Read only endpoint settings; never consume helper, extension, or process settings.
  if upload {
    let push_key = key.trim_end_matches("lfsurl").to_owned() + "lfspushurl";
    if let Some(value) = configured(&config, &push_key)?.or(configured(&config, "lfs.pushurl")?) {
      return Ok(Some(value));
    }
  }
  configured(&config, key)?.map_or_else(|| configured(&config, "lfs.url"), |value| Ok(Some(value)))
}

fn derived_endpoint(remote: &str) -> BackendResult<Url> {
  let mut url = if remote.starts_with("ssh://") {
    let url = Url::parse(remote)
      .map_err(|_| error("The SSH Git remote has no usable HTTPS LFS endpoint"))?;
    if url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
      return Err(error(
        "Configure an explicit HTTPS Git LFS endpoint for this SSH remote",
      ));
    }
    let host = url
      .host_str()
      .ok_or_else(|| error("The SSH Git remote has no host"))?;
    validate_url(&format!("https://{host}{}", url.path()))?
  } else if !remote.contains("://") {
    let (authority, path) = remote
      .split_once(':')
      .ok_or_else(|| error("Configure an HTTPS Git LFS endpoint for this remote"))?;
    let host = authority.rsplit('@').next().unwrap_or("");
    if host.is_empty() || host.contains(['/', '\\']) || path.is_empty() || host.len() == 1 {
      return Err(error("Configure an HTTPS Git LFS endpoint for this remote"));
    }
    validate_url(&format!("https://{host}/{}", path.trim_start_matches('/')))?
  } else {
    validate_url(remote)?
  };
  if url.query().is_some() {
    return Err(error(
      "Configure a Git LFS endpoint without query parameters",
    ));
  }
  let path = url.path().trim_end_matches('/');
  let path = if path.ends_with(".git") {
    format!("{path}/info/lfs")
  } else {
    format!("{path}.git/info/lfs")
  };
  url.set_path(&path);
  validate_url(url.as_str())
}

pub(super) fn download_remote(repo: &git2::Repository) -> BackendResult<String> {
  let config = repo.config()?;
  if let Some(name) = configured(&config, "remote.lfsdefault")? {
    return Ok(name);
  }
  if let Some(branch) = repo
    .head()
    .ok()
    .and_then(|head| head.shorthand().ok().map(str::to_owned))
    && let Some(name) = configured(&config, &format!("branch.{branch}.remote"))?
    && name != "."
  {
    return Ok(name);
  }
  Ok("origin".into())
}

pub(super) struct Context {
  pub api: Client,
  pub http: reqwest_lfs::Client,
  pub origin: String,
  pub credentials: Option<(String, String)>,
}

pub(super) fn client(
  repo: &git2::Repository,
  remote: &str,
  upload: bool,
) -> BackendResult<Context> {
  // Upstream diagnostics can print signed action URLs and authorization headers.
  if ["GIT_TRACE", "GIT_CURL_VERBOSE"]
    .iter()
    .any(|key| std::env::var_os(key).is_some_and(|value| !value.is_empty() && value != "0"))
  {
    return Err(error(
      "Disable GIT_TRACE and GIT_CURL_VERBOSE before transferring Git LFS objects to protect credentials",
    ));
  }
  let config = repo.config()?;
  check_adapters(&config)?;
  let key = format!("remote.{remote}.lfsurl");
  let push = if upload {
    configured(&config, &format!("remote.{remote}.lfspushurl"))?
      .or(configured(&config, "lfs.pushurl")?)
  } else {
    None
  };
  let explicit = push
    .or(configured(&config, &key)?)
    .or(configured(&config, "lfs.url")?);
  let configured_endpoint = match explicit {
    Some(value) => Some(value),
    None => file_endpoint(repo, &key, upload)?,
  };
  let endpoint = match configured_endpoint {
    Some(value) => validate_url(&value)?,
    None => {
      let remote = repo.find_remote(remote)?;
      let value = if upload {
        remote.pushurl()?.unwrap_or(remote.url()?)
      } else {
        remote.url()?
      };
      derived_endpoint(value)?
    }
  };
  // Credentials belong to the selected endpoint's origin, even when a repository
  // config changes hosts. They are never installed as transfer-client defaults.
  let credentials = if endpoint.scheme() == "https" {
    crate::platform::git_credentials::lookup(endpoint.as_str(), None)?
  } else {
    None
  };
  let auth = match credentials.as_ref() {
    Some((username, password)) => Auth::Basic {
      username: username.clone(),
      password: password.clone(),
    },
    None => Auth::None,
  };
  let http = reqwest_lfs::Client::builder()
    .https_only(!cfg!(test))
    .redirect(reqwest_lfs::redirect::Policy::none())
    .connect_timeout(Duration::from_secs(15))
    .timeout(Duration::from_secs(120))
    .pool_max_idle_per_host(2)
    .build()
    .map_err(|_| error("The secure Git LFS HTTP client could not be initialized"))?;
  Ok(Context {
    origin: endpoint.origin().ascii_serialization(),
    api: Client::with_http_client(endpoint, auth, http.clone()),
    http,
    credentials,
  })
}

#[cfg(test)]
#[path = "lfs_endpoint_tests.rs"]
mod tests;
