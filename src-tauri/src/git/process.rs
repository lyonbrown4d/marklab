use crate::error::{BackendError, BackendResult};
use std::path::Path;
pub fn error(code: &str, message: &str) -> BackendError {
    BackendError::new(code, message)
}
pub fn redact(input: &str) -> String {
    input
        .split_whitespace()
        .map(|word| {
            let Some((scheme, rest)) = word.split_once("://") else {
                return word.to_owned();
            };
            let end = rest.find(['?', '#']).unwrap_or(rest.len());
            let rest = &rest[..end];
            let authority_end = rest.find('/').unwrap_or(rest.len());
            let sanitized = if let Some(at) = rest[..authority_end].rfind('@') {
                format!("[redacted]@{}", &rest[at + 1..])
            } else {
                rest.into()
            };
            format!(
                "{scheme}://{sanitized}{}",
                if end < word.len().saturating_sub(scheme.len() + 3) {
                    "?[redacted]"
                } else {
                    ""
                }
            )
        })
        .collect::<Vec<_>>()
        .join(" ")
}
impl From<git2::Error> for BackendError {
    fn from(value: git2::Error) -> Self {
        let code = if value.code() == git2::ErrorCode::Auth {
            "git_authentication_required"
        } else if value.code() == git2::ErrorCode::Conflict {
            "git_conflicts_present"
        } else if value.code() == git2::ErrorCode::User {
            "git_operation_cancelled"
        } else {
            "git_command_failed"
        };
        error(code, &redact(value.message()))
    }
}
pub fn initialize() -> BackendResult<()> {
    static INITIALIZED: std::sync::OnceLock<Result<(), String>> = std::sync::OnceLock::new();
    let result = INITIALIZED.get_or_init(|| {
        // Serialized once, before any repository worker accesses libgit2 transport settings.
        // Bound stalled network jobs so the shared blocking pool always becomes available.
        unsafe {
            git2::opts::set_server_connect_timeout_in_milliseconds(15_000)
                .and_then(|_| git2::opts::set_server_timeout_in_milliseconds(30_000))
        }
        .map_err(|error| redact(error.message()))
    });
    result
        .as_ref()
        .map(|_| ())
        .map_err(|message| error("git_initialization_failed", message))
}
pub fn open(root: &Path) -> BackendResult<git2::Repository> {
    initialize()?;
    let repository = git2::Repository::open_ext(
        root,
        git2::RepositoryOpenFlags::NO_SEARCH,
        std::iter::empty::<&std::ffi::OsStr>(),
    )
    .map_err(|value| {
        if value.code() == git2::ErrorCode::NotFound {
            error("git_not_repository", "Workspace is not a Git repository")
        } else {
            value.into()
        }
    })?;
    let workdir = repository
        .workdir()
        .ok_or_else(|| error("git_workspace_boundary", "A Git worktree is required"))?;
    if std::fs::canonicalize(root)? != std::fs::canonicalize(workdir)? {
        return Err(error(
            "git_workspace_boundary",
            "Repository top-level must equal workspace root",
        ));
    }
    Ok(repository)
}
pub fn signature(repository: &git2::Repository) -> BackendResult<git2::Signature<'static>> {
    let config = repository.config()?;
    let name = config
        .get_string("user.name")
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "marklab".into());
    let email = config
        .get_string("user.email")
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "marklab@local".into());
    Ok(git2::Signature::now(&name, &email)?)
}
pub async fn repository<T: Send + 'static>(
    root: &Path,
    work: impl FnOnce(&mut git2::Repository) -> BackendResult<T> + Send + 'static,
) -> BackendResult<T> {
    let root = root.to_owned();
    crate::blocking::run(move || {
        let mut repository = open(&root)?;
        work(&mut repository)
    })
    .await
}
pub async fn init(root: &Path) -> BackendResult<super::types::RepoInfo> {
    let root = root.to_owned();
    crate::blocking::run(move || {
        initialize()?;
        let mut options = git2::RepositoryInitOptions::new();
        options.initial_head("main");
        let repo = git2::Repository::init_opts(&root, &options)?;
        super::status::repo_now(&repo)
    })
    .await
}
