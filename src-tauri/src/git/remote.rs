use super::{
    process::{self, error, redact},
    status,
    types::*,
};
use crate::error::BackendResult;
use std::path::Path;
pub fn name(value: &str) -> BackendResult<&str> {
    if value.is_empty()
        || value.len() > 128
        || !value.as_bytes()[0].is_ascii_alphanumeric()
        || value.contains("..")
        || value.ends_with(".lock")
        || !value
            .bytes()
            .all(|v| v.is_ascii_alphanumeric() || b"._-".contains(&v))
    {
        return Err(error("git_invalid_input", "Invalid Git remote name"));
    }
    Ok(value)
}
pub fn url(value: &str) -> BackendResult<&str> {
    if value.trim().is_empty()
        || value.starts_with('-')
        || value.contains("::")
        || value.chars().any(char::is_control)
    {
        return Err(error("git_invalid_input", "Invalid Git remote URL"));
    }
    if let Some((scheme, rest)) = value.split_once("://") {
        if !["https", "ssh", "file"].contains(&scheme.to_ascii_lowercase().as_str()) {
            return Err(error(
                "git_invalid_input",
                "Unsupported Git remote URL scheme",
            ));
        }
        if value.contains(['?', '#']) {
            return Err(error(
                "git_invalid_input",
                "Remote URL query parameters and fragments are not allowed",
            ));
        }
        let authority = rest.split('/').next().unwrap_or("");
        if scheme != "file" && authority.is_empty() {
            return Err(error("git_invalid_input", "Invalid remote URL host"));
        }
        if let Some((user, _)) = authority.rsplit_once('@')
            && (scheme == "https" || user.contains(':'))
        {
            return Err(error(
                "git_invalid_input",
                "Remote URL cannot contain embedded credentials",
            ));
        }
    } else if let Some((host, path)) = value.split_once(':') {
        let windows = value.as_bytes().get(1) == Some(&b':') && path.starts_with(['\\', '/']);
        if !windows
            && (host.is_empty()
                || host.contains([' ', '/', '\\'])
                || path.is_empty()
                || !path
                    .bytes()
                    .all(|v| v.is_ascii_alphanumeric() || b"._~/-".contains(&v)))
        {
            return Err(error(
                "git_invalid_input",
                "Invalid remote URL or remote helper",
            ));
        }
    }
    Ok(value)
}
pub fn status_now(repo: &git2::Repository) -> BackendResult<RemoteStatus> {
    let info = status::repo_now(repo)?;
    let upstream = info
        .branch
        .as_ref()
        .and_then(|name| repo.find_branch(name, git2::BranchType::Local).ok())
        .and_then(|branch| branch.upstream().ok());
    let upstream_name = upstream
        .as_ref()
        .and_then(|branch| branch.name().ok().flatten())
        .map(str::to_owned);
    let (ahead, behind) = if let Some(upstream) = upstream {
        match (
            info.head.as_ref().and_then(|v| git2::Oid::from_str(v).ok()),
            upstream.get().target(),
        ) {
            (Some(head), Some(target)) => repo.graph_ahead_behind(head, target)?,
            _ => (0, 0),
        }
    } else {
        (0, 0)
    };
    let mut remotes = Vec::new();
    for name in names_now(repo)? {
        let remote = repo.find_remote(&name)?;
        remotes.push(Remote {
            name,
            fetch_url: Some(redact(remote.url()?)),
            push_url: Some(redact(remote.pushurl()?.unwrap_or(remote.url()?))),
        });
    }
    remotes.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(RemoteStatus {
        remotes,
        branch: info.branch.clone(),
        upstream: upstream_name,
        ahead: ahead as u64,
        behind: behind as u64,
        detached: info.branch.is_none() && info.head.is_some(),
    })
}
pub async fn status(root: &Path) -> BackendResult<RemoteStatus> {
    process::repository(root, |repo| status_now(repo)).await
}
pub async fn configure(
    root: &Path,
    request: &RemoteRequest,
    remove: bool,
) -> BackendResult<RemoteStatus> {
    let name = name(&request.name)?.to_owned();
    let url = if remove {
        None
    } else {
        Some(
            url(request
                .url
                .as_deref()
                .ok_or_else(|| error("git_invalid_input", "Remote URL is required"))?)?
            .to_owned(),
        )
    };
    process::repository(root, move |repo| {
        if remove {
            repo.remote_delete(&name)?;
        } else if let Some(url) = url {
            if repo.find_remote(&name).is_ok() {
                repo.remote_set_url(&name, &url)?;
            } else {
                repo.remote(&name, &url)?;
            }
        }
        status_now(repo)
    })
    .await
}
pub async fn network(
    root: &Path,
    request: &NetworkRequest,
    operation: &str,
) -> BackendResult<RemoteStatus> {
    let selected = request
        .remote
        .as_deref()
        .map(name)
        .transpose()?
        .map(str::to_owned);
    let setup = request.set_upstream.unwrap_or(false);
    let operation = operation.to_owned();
    process::repository(root, move |repo| {
        for name in names_now(repo)? {
            if selected.as_deref().is_none_or(|v| v == name.as_str()) {
                let remote = repo.find_remote(&name)?;
                url(remote.url()?)?;
                if let Some(value) = remote.pushurl()? {
                    url(value)?;
                }
            }
        }
        match operation.as_str() {
            "fetch" => {
                let names = if let Some(selected) = selected {
                    vec![selected]
                } else {
                    names_now(repo)?
                };
                for name in names {
                    fetch_now(repo, &name)?;
                }
            }
            "pull" => {
                status::clean_now(repo)?;
                let branch = status::repo_now(repo)?
                    .branch
                    .ok_or_else(|| error("git_detached_head", "Cannot pull from detached HEAD"))?;
                let config = repo.config()?;
                let remote = config
                    .get_string(&format!("branch.{branch}.remote"))
                    .map_err(|_| {
                        error(
                            "git_upstream_missing",
                            "Cannot pull without an upstream branch",
                        )
                    })?;
                fetch_now(repo, &remote)?;
                let upstream = repo
                    .find_branch(&branch, git2::BranchType::Local)?
                    .upstream()
                    .map_err(|_| {
                        error(
                            "git_upstream_missing",
                            "Cannot pull without an upstream branch",
                        )
                    })?;
                let target = upstream.get().peel_to_commit()?;
                let head = repo.head()?.peel_to_commit()?;
                if head.id() != target.id() {
                    if !repo.graph_descendant_of(target.id(), head.id())? {
                        return Err(error(
                            "git_command_failed",
                            "Pull requires a fast-forward update",
                        ));
                    }
                    repo.checkout_tree(
                        target.as_object(),
                        Some(git2::build::CheckoutBuilder::new().safe()),
                    )?;
                    repo.head()?.set_target(target.id(), "pull: fast-forward")?;
                }
            }
            "push" => {
                let branch = status::repo_now(repo)?
                    .branch
                    .ok_or_else(|| error("git_detached_head", "Cannot push from detached HEAD"))?;
                let mut config = repo.config()?;
                let configured = config.get_string(&format!("branch.{branch}.remote")).ok();
                let upstream = config.get_string(&format!("branch.{branch}.merge")).ok();
                if !setup && upstream.is_none() {
                    return Err(error(
                        "git_upstream_missing",
                        "Current branch has no upstream; setUpstream is required",
                    ));
                }
                let remote_name = name(
                    selected
                        .as_deref()
                        .or(configured.as_deref())
                        .unwrap_or("origin"),
                )?;
                let mut remote = repo.find_remote(remote_name)?;
                let destination = if setup || selected.is_some() {
                    format!("refs/heads/{branch}")
                } else {
                    upstream.ok_or_else(|| {
                        error("git_upstream_missing", "Upstream branch is missing")
                    })?
                };
                if !git2::Reference::is_valid_name(&destination)
                    || !destination.starts_with("refs/heads/")
                {
                    return Err(error("git_invalid_input", "Invalid upstream branch"));
                }
                let mut options = git2::PushOptions::new();
                options.remote_callbacks(super::transport::callbacks(None));
                remote.push(
                    &[format!("refs/heads/{branch}:{destination}")],
                    Some(&mut options),
                )?;
                if setup {
                    config.set_str(&format!("branch.{branch}.remote"), remote_name)?;
                    config.set_str(
                        &format!("branch.{branch}.merge"),
                        &format!("refs/heads/{branch}"),
                    )?;
                }
            }
            _ => return Err(error("git_invalid_input", "Invalid remote operation")),
        }
        status_now(repo)
    })
    .await
}
fn fetch_now(repo: &git2::Repository, name: &str) -> BackendResult<()> {
    let mut remote = repo.find_remote(name)?;
    let mut options = git2::FetchOptions::new();
    options
        .prune(git2::FetchPrune::On)
        .remote_callbacks(super::transport::callbacks(None));
    remote.fetch(&[] as &[&str], Some(&mut options), None)?;
    Ok(())
}

fn names_now(repo: &git2::Repository) -> BackendResult<Vec<String>> {
    let mut names = Vec::new();
    for name in repo.remotes()?.iter() {
        if let Some(name) = name? {
            names.push(name.to_owned());
        }
    }
    Ok(names)
}
