use crate::error::{BackendError, BackendResult};
use std::path::{Path, PathBuf};
pub fn validate(path: &Path) -> BackendResult<PathBuf> {
  if !path.is_absolute() {
    return Err(BackendError::new(
      "terminal_invalid_shell",
      "Terminal shell must be an absolute executable file path",
    ));
  }
  let metadata = std::fs::metadata(path)?;
  if !metadata.is_file() {
    return Err(BackendError::new(
      "terminal_invalid_shell",
      "Terminal shell must point to a file",
    ));
  }
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    if metadata.permissions().mode() & 0o111 == 0 {
      return Err(BackendError::new(
        "terminal_invalid_shell",
        "Terminal shell is not executable",
      ));
    }
  }
  #[cfg(windows)]
  {
    let ext = path
      .extension()
      .and_then(|v| v.to_str())
      .unwrap_or("")
      .to_ascii_lowercase();
    if !["exe", "com", "bat", "cmd"].contains(&ext.as_str()) {
      return Err(BackendError::new(
        "terminal_invalid_shell",
        "Terminal shell must use a Windows executable extension",
      ));
    }
  }
  Ok(path.to_path_buf())
}
pub fn resolve(requested: Option<&str>) -> BackendResult<PathBuf> {
  if let Some(path) = requested {
    return validate(Path::new(path.trim()));
  }
  #[cfg(unix)]
  {
    if let Some(path) = std::env::var_os("SHELL")
      && let Ok(shell) = validate(Path::new(&path))
    {
      return Ok(shell);
    }
    let candidates = if cfg!(target_os = "macos") {
      vec!["/bin/zsh", "/bin/bash", "/bin/sh"]
    } else {
      vec!["/bin/bash", "/usr/bin/bash", "/bin/sh", "/usr/bin/sh"]
    };
    for path in candidates {
      if let Ok(shell) = validate(Path::new(path)) {
        return Ok(shell);
      }
    }
  }
  #[cfg(windows)]
  {
    if let Some(paths) = std::env::var_os("PATH") {
      for name in ["pwsh.exe", "powershell.exe"] {
        for directory in std::env::split_paths(&paths).filter(|p| p.is_absolute()) {
          if let Ok(shell) = validate(&directory.join(name)) {
            return Ok(shell);
          }
        }
      }
    }
    if let Some(root) = std::env::var_os("SYSTEMROOT")
      && let Ok(shell) =
        validate(&PathBuf::from(root).join("System32/WindowsPowerShell/v1.0/powershell.exe"))
    {
      return Ok(shell);
    }
  }
  Err(BackendError::new(
    "terminal_shell_missing",
    "No supported terminal shell was found; configure an executable shell path",
  ))
}
pub fn environment(command: &mut portable_pty::CommandBuilder) {
  for (key, value) in [
    ("TERM", "xterm-256color"),
    ("COLORTERM", "truecolor"),
    ("TERM_PROGRAM", "Marklab"),
  ] {
    if std::env::var_os(key).is_none() {
      command.env(key, value);
    }
  }
  #[cfg(target_os = "linux")]
  {
    let locales = ["LC_ALL", "LC_CTYPE", "LANG"].map(|key| std::env::var(key).ok());
    if let Some(key) = utf8_override(locales.each_ref().map(|value| value.as_deref())) {
      command.env(key, "C.UTF-8");
    }
  }
  #[cfg(all(unix, not(target_os = "linux")))]
  if !["LC_ALL", "LC_CTYPE", "LANG"].iter().any(|key| {
    std::env::var(key)
      .is_ok_and(|value| value.to_ascii_lowercase().replace('-', "").contains("utf8"))
  }) {
    command.env(
      "LC_CTYPE",
      if cfg!(target_os = "macos") {
        "en_US.UTF-8"
      } else {
        "C.UTF-8"
      },
    );
  }
}
#[cfg(target_os = "linux")]
fn utf8_override(locales: [Option<&str>; 3]) -> Option<&'static str> {
  // POSIX locale precedence is LC_ALL > LC_CTYPE > LANG. A UTF-8 LANG
  // cannot compensate for LC_ALL=C, and setting only LC_CTYPE cannot either.
  let keys = ["LC_ALL", "LC_CTYPE", "LC_CTYPE"];
  for (index, locale) in locales.into_iter().enumerate() {
    if let Some(locale) = locale.filter(|value| !value.is_empty()) {
      return (!locale
        .to_ascii_lowercase()
        .replace('-', "")
        .contains("utf8"))
      .then_some(keys[index]);
    }
  }
  Some("LC_CTYPE")
}
#[cfg(test)]
mod tests {
  #[cfg(target_os = "linux")]
  #[test]
  fn terminal_locale_follows_posix_precedence() {
    use super::utf8_override;
    assert_eq!(
      utf8_override([Some("C"), None, Some("en_US.UTF-8")]),
      Some("LC_ALL")
    );
    assert_eq!(
      utf8_override([Some("C"), Some("C.UTF-8"), None]),
      Some("LC_ALL")
    );
    assert_eq!(
      utf8_override([None, Some("C"), Some("en_US.UTF-8")]),
      Some("LC_CTYPE")
    );
    assert_eq!(utf8_override([Some("C.UTF-8"), Some("C"), None]), None);
    assert_eq!(utf8_override([Some(""), None, Some("zh_CN.utf8")]), None);
    assert_eq!(utf8_override([None, None, Some("C")]), Some("LC_CTYPE"));
    assert_eq!(utf8_override([None, None, None]), Some("LC_CTYPE"));
  }
  #[test]
  fn rejects_relative_shell() {
    assert!(super::validate(std::path::Path::new("sh")).is_err());
  }
}
