use super::{
    preview,
    process::{self, error},
    safety, status,
    types::*,
};
use crate::error::BackendResult;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::Path;
#[derive(Clone, Serialize)]
#[serde(untagged)]
pub enum ConflictPreview {
    Text(Conflict),
    Unavailable {
        path: String,
        unavailable_reason: String,
    },
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    pub path: String,
    pub base: Option<String>,
    pub ours: Option<String>,
    pub theirs: Option<String>,
    pub result: String,
    pub revision: String,
    pub deleted: bool,
    pub marker_size: usize,
}
#[derive(Clone, Serialize)]
pub(super) struct Stage {
    pub(super) mode: String,
    pub(super) hash: String,
    pub(super) stage: u8,
}
struct Details {
    snapshot: Conflict,
    stages: Vec<Stage>,
    attribute: String,
}
#[derive(Serialize)]
pub struct SaveResult {
    pub status: Status,
    pub revision: String,
    pub staged: bool,
}
fn revision(file: &str, stages: &[Stage], result: &str, deleted: bool, attribute: &str) -> String {
    let mut hash = Sha256::new();
    hash.update(file.as_bytes());
    for stage in stages {
        hash.update(stage.mode.as_bytes());
        hash.update(stage.hash.as_bytes());
        hash.update([stage.stage]);
    }
    hash.update([deleted as u8]);
    hash.update(attribute.as_bytes());
    hash.update(result.as_bytes());
    hex::encode(hash.finalize())
}
async fn details(root: &Path, file: &str) -> BackendResult<Result<Details, &'static str>> {
    safety::file_path(file)?;
    let status = status::status(root).await?;
    if !status.conflicts.iter().any(|v| v.path == file) {
        return Err(error(
            "git_invalid_input",
            "Selected file is no longer an unresolved conflict; refresh the view",
        ));
    }
    safety::selected(root, &[file.into()], &status).await?;
    let selected = file.to_owned();
    let (stages, attribute) = process::repository(root, move |repo| {
        let conflict = repo.index()?.conflict_get(Path::new(&selected))?;
        let mut stages = Vec::new();
        for (position, entry) in [conflict.ancestor, conflict.our, conflict.their]
            .into_iter()
            .enumerate()
        {
            if let Some(entry) = entry {
                if ![0o100644, 0o100755].contains(&entry.mode) {
                    return Err(error(
                        "git_workspace_boundary",
                        "Conflict editing supports regular files only",
                    ));
                }
                stages.push(Stage {
                    mode: format!("{:o}", entry.mode),
                    hash: entry.id.to_string(),
                    stage: position as u8 + 1,
                });
            }
        }
        let attribute = match git2::AttrValue::from_bytes(repo.get_attr_bytes(
            Path::new(&selected),
            "conflict-marker-size",
            git2::AttrCheckFlags::empty(),
        )?) {
            git2::AttrValue::True => "set".into(),
            git2::AttrValue::False => "unset".into(),
            git2::AttrValue::Unspecified => "unspecified".into(),
            git2::AttrValue::String(value) => value.to_owned(),
            _ => {
                return Err(error(
                    "git_invalid_input",
                    "Invalid conflict marker attribute",
                ));
            }
        };
        Ok((stages, attribute))
    })
    .await?;
    let mut blobs: [Option<String>; 3] = [None, None, None];
    for stage in &stages {
        match preview::decode(preview::read_object(root, &stage.hash).await?) {
            Ok(text) => blobs[(stage.stage - 1) as usize] = Some(text),
            Err(reason) => return Ok(Err(reason)),
        }
    }
    let path = safety::worktree_path(root, file).await?;
    let deleted = !tokio::fs::try_exists(&path).await?;
    let result = match preview::worktree(root, file).await? {
        Ok(value) => value,
        Err(reason) => return Ok(Err(reason)),
    };
    let marker_size = if ["unspecified", "set", "unset"].contains(&attribute.as_str()) {
        7
    } else {
        attribute
            .parse::<usize>()
            .ok()
            .filter(|v| (1..=1024).contains(v))
            .ok_or_else(|| {
                error(
                    "git_invalid_input",
                    "Conflict marker width must be between 1 and 1024",
                )
            })?
    };
    let rev = revision(file, &stages, &result, deleted, &attribute);
    Ok(Ok(Details {
        snapshot: Conflict {
            path: file.into(),
            base: blobs[0].take(),
            ours: blobs[1].take(),
            theirs: blobs[2].take(),
            result,
            revision: rev,
            deleted,
            marker_size,
        },
        stages,
        attribute,
    }))
}
pub async fn read(root: &Path, file: &str) -> BackendResult<ConflictPreview> {
    Ok(match details(root, file).await? {
        Ok(value) => ConflictPreview::Text(value.snapshot),
        Err(reason) => ConflictPreview::Unavailable {
            path: file.into(),
            unavailable_reason: reason.into(),
        },
    })
}
fn markers(content: &str, size: usize) -> bool {
    let mut opened = std::collections::HashSet::new();
    let mut separated = std::collections::HashSet::new();
    for line in content.lines() {
        let Some(first) = line.chars().next() else {
            continue;
        };
        if !['<', '=', '>', '|'].contains(&first) {
            continue;
        }
        let width = line.chars().take_while(|v| *v == first).count();
        let tail = &line[width..];
        if !tail.is_empty() && !tail.starts_with([' ', '\t', '\r']) {
            continue;
        }
        if width >= size.min(7) {
            return true;
        }
        match first {
            '<' => {
                opened.insert(width);
            }
            '=' if opened.contains(&width) => {
                separated.insert(width);
            }
            '>' if separated.contains(&width) => return true,
            _ => (),
        }
    }
    false
}
pub async fn save(root: &Path, request: &ConflictSaveRequest) -> BackendResult<SaveResult> {
    if request.content.len() > preview::MAX_PREVIEW
        || request.content.contains('\0')
        || request.revision.len() != 64
        || !request.revision.bytes().all(|v| v.is_ascii_hexdigit())
        || request.delete_file.unwrap_or(false) && !request.content.is_empty()
    {
        return Err(error("git_invalid_input", "Invalid conflict save request"));
    }
    let details = details(root, &request.path)
        .await?
        .map_err(|reason| error("git_invalid_input", reason))?;
    let expected = details.snapshot;
    if !expected.revision.eq_ignore_ascii_case(&request.revision) {
        return Err(error(
            "git_invalid_input",
            "Conflict changed outside this editor; refresh before saving",
        ));
    }
    let deleted = request.delete_file.unwrap_or(false);
    let staged = request.stage.unwrap_or(false);
    if staged && !deleted && markers(&request.content, expected.marker_size) {
        return Err(error(
            "git_conflicts_present",
            "Remove all conflict markers before staging",
        ));
    }
    let write_root = root.to_owned();
    let write_expected = expected.clone();
    let write_content = request.content.clone();
    let write_stages = details.stages.clone();
    super::blocking::filesystem(move || {
        super::conflict_index::verify(&write_root, &write_expected.path, &write_stages)?;
        super::conflict_write::write(
            &write_root,
            &write_expected,
            &write_content,
            deleted,
            &write_stages,
        )
    })
    .await?;
    let revision = revision(
        &request.path,
        &details.stages,
        &request.content,
        deleted,
        &details.attribute,
    );
    if staged {
        let file = request.path.clone();
        let expected_stages = details.stages.clone();
        process::repository(root, move |repo| {
            super::conflict_index::verify_now(repo, &file, &expected_stages)?;
            let mut index = repo.index()?;
            if deleted {
                index.remove_path(Path::new(&file))?;
            } else {
                index.add_path(Path::new(&file))?;
            }
            index.write()?;
            Ok(())
        })
        .await?;
    }
    Ok(SaveResult {
        status: status::status(root).await?,
        revision,
        staged,
    })
}
#[cfg(test)]
mod tests {
    #[test]
    fn detects_prior_marker_width() {
        assert!(super::markers("<<< ours\nx\n===\ny\n>>> theirs", 7));
        assert!(!super::markers("===\nheading", 7));
    }
}
