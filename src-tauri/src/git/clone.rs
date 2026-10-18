use super::{
    GitState, blocking::filesystem, clone_destination::Destination, process::error, remote, safety,
    status, types::RepoInfo,
};
use crate::error::BackendResult;
use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
pub async fn clone_repository(
    state: &GitState,
    url: &str,
    target: &Path,
    branch: Option<&str>,
    cancel: Arc<AtomicBool>,
) -> BackendResult<RepoInfo> {
    let url = remote::url(url)?.to_owned();
    let branch = branch.map(safety::branch_now).transpose()?;
    if !target.is_absolute()
        || target
            .as_os_str()
            .to_string_lossy()
            .chars()
            .any(char::is_control)
    {
        return Err(error(
            "git_invalid_input",
            "An absolute Git clone target path is required",
        ));
    }
    let parent = target
        .parent()
        .ok_or_else(|| error("git_invalid_input", "Invalid clone target"))?;
    let basename = target
        .file_name()
        .ok_or_else(|| error("git_invalid_input", "Invalid clone target"))?;
    let canonical = tokio::fs::canonicalize(parent).await?.join(basename);
    let lock = state.lock(&canonical).await;
    let _guard = lock.lock().await;
    let _cache_invalidation = state.invalidation(&canonical);
    let target = target.to_owned();
    filesystem(move || {
        super::process::initialize()?;
        if cancel.load(Ordering::Acquire) {
            return Err(error("git_operation_cancelled", "Git clone was cancelled"));
        }
        let destination = Destination::prepare(target)?;
        let work = || {
            let mut fetch = git2::FetchOptions::new();
            fetch.remote_callbacks(super::transport::callbacks(Some(cancel.clone())));
            let mut checkout = git2::build::CheckoutBuilder::new();
            let checkout_cancel = cancel.clone();
            checkout
                .notify_on(git2::CheckoutNotificationType::all())
                .notify(move |_, _, _, _, _| !checkout_cancel.load(Ordering::Acquire));
            let mut builder = git2::build::RepoBuilder::new();
            builder.fetch_options(fetch).with_checkout(checkout);
            if let Some(branch) = &branch {
                builder.branch(branch);
            }
            let repository = builder.clone(&url, &destination.staging)?;
            if cancel.load(Ordering::Acquire) {
                return Err(error("git_operation_cancelled", "Git clone was cancelled"));
            }
            drop(repository);
            destination.publish()?;
            status::repo_now(&super::process::open(&destination.target)?)
        };
        let result = work();
        let cleanup = destination.cleanup();
        if result.is_ok() {
            cleanup?;
        }
        result
    })
    .await
}
