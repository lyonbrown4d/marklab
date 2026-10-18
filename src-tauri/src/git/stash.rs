use super::{
    history,
    process::{self, error},
    safety, status,
    types::*,
};
use crate::error::BackendResult;
use std::path::Path;
pub async fn stash_save(root: &Path, request: &StashSaveRequest) -> BackendResult<Status> {
    let message = safety::message(request.message.as_deref().unwrap_or(""), true)?.to_owned();
    process::repository(root, move |repo| {
        status::no_operation_now(repo)?;
        let signature = process::signature(repo)?;
        repo.stash_save2(
            &signature,
            (!message.is_empty()).then_some(message.as_str()),
            Some(git2::StashFlags::INCLUDE_UNTRACKED),
        )?;
        status::status_now(repo)
    })
    .await
}
pub async fn stash_action(
    root: &Path,
    request: &StashRequest,
    drop: bool,
) -> BackendResult<Status> {
    let reference = request.r#ref.clone();
    let expected = request.expected_hash.clone();
    let root = root.to_owned();
    let lock_root = root.clone();
    process::repository(&root, move |repo| {
        status::no_operation_now(repo)?;
        let locker = process::open(&lock_root)?;
        let mut transaction = locker.transaction()?;
        transaction.lock_ref("refs/stash")?;
        let (index, _) = history::require_stash_now(repo, &reference, expected.as_deref())?;
        if drop {
            let mut log = repo.reflog("refs/stash")?;
            log.remove(index, true)?;
            if log.is_empty() {
                transaction.remove("refs/stash")?;
            } else if index == 0 {
                let oid = log
                    .get(0)
                    .ok_or_else(|| error("git_invalid_input", "Stash changed"))?
                    .id_new();
                transaction.set_target(
                    "refs/stash",
                    oid,
                    Some(&process::signature(repo)?),
                    "stash: drop",
                )?;
            }
            transaction.set_reflog("refs/stash", log)?;
            transaction.commit()?;
        } else {
            repo.stash_apply(index, None)?;
            std::mem::drop(transaction);
        }
        status::status_now(repo)
    })
    .await
}
