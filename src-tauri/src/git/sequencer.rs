use super::{
    process::{self, error},
    safety, sequence,
};
use crate::error::BackendResult;
use std::{io::Write, path::Path};
struct Action {
    verb: String,
    oid: git2::Oid,
}
pub fn continue_remaining(
    repo: &git2::Repository,
    todo: &str,
    head: Option<&str>,
    options: Option<&str>,
    mainline: Option<u32>,
) -> BackendResult<()> {
    let actions = actions(repo, todo)?.into_iter().skip(1).collect::<Vec<_>>();
    for (position, action) in actions.iter().enumerate() {
        restore(repo, &actions[position..], head, options)?;
        let commit = repo.find_commit(action.oid)?;
        let message = if action.verb == "pick" {
            commit.message()?.to_owned()
        } else {
            format!(
                "Revert \"{}\"\n\nThis reverts commit {}.",
                commit.summary()?.unwrap_or(""),
                commit.id()
            )
        };
        if action.verb == "pick" {
            repo.cherrypick(&commit, None)?;
        } else {
            let mut options = git2::RevertOptions::new();
            options.mainline(mainline.unwrap_or(0));
            repo.revert(&commit, Some(&mut options))?;
        }
        sequence::finish_simple(repo, &message)?;
    }
    Ok(())
}
fn restore(
    repo: &git2::Repository,
    actions: &[Action],
    head: Option<&str>,
    options: Option<&str>,
) -> BackendResult<()> {
    let directory = repo.path().join("sequencer");
    match std::fs::symlink_metadata(&directory) {
        Ok(meta) if !meta.is_dir() || meta.file_type().is_symlink() => {
            return Err(error(
                "git_workspace_boundary",
                "Unsafe Git sequencer directory",
            ));
        }
        Ok(_) => (),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => std::fs::create_dir(&directory)?,
        Err(e) => return Err(e.into()),
    }
    let todo = actions
        .iter()
        .map(|action| format!("{} {}\n", action.verb, action.oid))
        .collect::<String>();
    write(&directory.join("todo"), &todo)?;
    if let Some(head) = head {
        safety::hash(head.trim())?;
        write(&directory.join("head"), head)?;
    }
    if let Some(options) = options {
        write(&directory.join("opts"), options)?;
    }
    Ok(())
}
fn write(path: &Path, text: &str) -> BackendResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| error("git_workspace_boundary", "Invalid sequencer path"))?;
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    file.write_all(text.as_bytes())?;
    file.as_file().sync_all()?;
    file.persist(path)
        .map_err(|e| process::error("git_command_failed", &e.error.to_string()))?;
    Ok(())
}

pub fn validate(repo: &git2::Repository, todo: &str) -> BackendResult<()> {
    actions(repo, todo).map(|_| ())
}
fn actions(repo: &git2::Repository, todo: &str) -> BackendResult<Vec<Action>> {
    let mut actions = Vec::new();
    for line in todo
        .lines()
        .filter(|line| !line.trim().is_empty() && !line.trim_start().starts_with('#'))
    {
        let mut fields = line.split_whitespace();
        let verb = fields.next().unwrap_or("");
        let hash = fields.next().unwrap_or("");
        if !["pick", "revert"].contains(&verb)
            || !(4..=64).contains(&hash.len())
            || !hash.bytes().all(|v| v.is_ascii_hexdigit())
        {
            return Err(error(
                "git_unsafe_configuration",
                "Unsupported Git sequencer entry",
            ));
        }
        let commit = repo.revparse_single(hash)?.peel_to_commit()?;
        actions.push(Action {
            verb: verb.into(),
            oid: commit.id(),
        });
    }
    Ok(actions)
}
