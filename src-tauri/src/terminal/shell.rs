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
        if let Some(root) = std::env::var_os("SYSTEMROOT") {
            if let Ok(shell) = validate(
                &PathBuf::from(root).join("System32/WindowsPowerShell/v1.0/powershell.exe"),
            ) {
                return Ok(shell);
            }
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
    if !cfg!(windows)
        && !["LC_ALL", "LC_CTYPE", "LANG"].iter().any(|key| {
            std::env::var(key)
                .is_ok_and(|v| v.to_ascii_lowercase().replace('-', "").contains("utf8"))
        })
    {
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
#[cfg(test)]
mod tests {
    #[test]
    fn rejects_relative_shell() {
        assert!(super::validate(std::path::Path::new("sh")).is_err());
    }
}
