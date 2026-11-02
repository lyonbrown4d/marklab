use super::{
  lfs_endpoint::{Context, error},
  lfs_transfer_io,
};
use crate::error::{BackendError, BackendResult};
use futures_util::{StreamExt, TryStreamExt, stream};
use git_lfs_api::{BatchRequest, BatchResponse, ObjectResult, ObjectSpec, Operation, Ref};
use git_lfs_pointer::Pointer;
use git_lfs_store::Store;
use std::{collections::HashMap, time::Duration};

pub(super) fn authentication_error() -> BackendError {
  super::process::error(
    "git_authentication_required",
    "Git LFS requires HTTPS credentials; add a username and access token for the LFS server in Git remote settings",
  )
}

fn specs(pointers: &[Pointer]) -> Vec<ObjectSpec> {
  pointers
    .iter()
    .map(|pointer| ObjectSpec {
      oid: pointer.oid.to_string(),
      size: pointer.size,
    })
    .collect()
}

fn plan(
  response: BatchResponse,
  requested: &[ObjectSpec],
  operation: Operation,
) -> BackendResult<Vec<ObjectResult>> {
  if response
    .transfer
    .as_deref()
    .is_some_and(|value| value != "basic")
  {
    return Err(error(
      "The Git LFS server selected an unsupported transfer adapter; use HTTPS basic transfer",
    ));
  }
  if response
    .hash_algo
    .as_deref()
    .is_some_and(|value| value != "sha256")
  {
    return Err(error(
      "The Git LFS server selected an unsupported object hash algorithm",
    ));
  }
  let mut expected: HashMap<&str, u64> = requested
    .iter()
    .map(|object| (object.oid.as_str(), object.size))
    .collect();
  if expected.len() != requested.len() || response.objects.len() != requested.len() {
    return Err(error(
      "The Git LFS server returned an incomplete or unexpected object batch",
    ));
  }
  let mut result = Vec::with_capacity(requested.len());
  for mut object in response.objects {
    let size = expected
      .remove(object.oid.as_str())
      .ok_or_else(|| error("The Git LFS server returned a duplicate or unrequested object"))?;
    if object.size == 0 {
      object.size = size;
    }
    if object.size != size {
      return Err(error(
        "The Git LFS server returned an inconsistent object size",
      ));
    }
    if let Some(failure) = object.error.as_ref() {
      return Err(if matches!(failure.code, 401 | 403) {
        authentication_error()
      } else {
        error("A requested Git LFS object is unavailable on the server")
      });
    }
    if let Some(actions) = object.actions.as_ref() {
      for action in [&actions.download, &actions.upload, &actions.verify]
        .into_iter()
        .flatten()
      {
        lfs_transfer_io::validate_action(action)?;
      }
    }
    if operation == Operation::Download
      && object
        .actions
        .as_ref()
        .and_then(|actions| actions.download.as_ref())
        .is_none()
    {
      return Err(error(
        "The Git LFS server omitted a requested download action",
      ));
    }
    result.push(object);
  }
  if !expected.is_empty() {
    return Err(error("The Git LFS server omitted a requested object"));
  }
  Ok(result)
}

async fn batch(context: &Context, request: &BatchRequest) -> BackendResult<BatchResponse> {
  for attempt in 0..2 {
    match context.api.batch(request).await {
      Ok(response) => return Ok(response),
      Err(value) if value.is_unauthorized() || value.is_forbidden() => {
        return Err(authentication_error());
      }
      Err(value) if attempt == 0 && value.is_retryable() => {
        tokio::time::sleep(Duration::from_secs(1)).await
      }
      Err(_) => {
        return Err(error(
          "Git LFS batch negotiation failed; check the endpoint, network connection, and stored credentials",
        ));
      }
    }
  }
  Err(error("Git LFS batch negotiation failed"))
}

pub(super) async fn run(
  context: &Context,
  store: &Store,
  pointers: &[Pointer],
  operation: Operation,
  reference: Option<Ref>,
) -> BackendResult<()> {
  for chunk in pointers.chunks(100) {
    if chunk.iter().any(|pointer| !pointer.extensions.is_empty()) {
      return Err(error("Git LFS pointer extensions are unsupported"));
    }
    let mut request = BatchRequest::new(operation, specs(chunk)).with_transfers(["basic".into()]);
    if let Some(reference) = reference.clone() {
      request = request.with_ref(reference);
    }
    let objects = plan(batch(context, &request).await?, &request.objects, operation)?;
    // This root future is polled on the original blocking Git caller. Keep
    // verification there so cancellation cannot detach additional hashing jobs.
    // Verify the whole batch before its first PUT; remote-present objects need no file.
    let mut prepared = Vec::with_capacity(objects.len());
    for object in objects {
      super::lfs_cancel::check()?;
      let pointer = Pointer::new(
        object
          .oid
          .parse()
          .map_err(|_| error("The Git LFS object identifier is invalid"))?,
        object.size,
      );
      let upload = operation == Operation::Upload
        && object
          .actions
          .as_ref()
          .and_then(|actions| actions.upload.as_ref())
          .is_some();
      let file = if upload {
        Some(super::lfs::open_object(store, &pointer)?)
      } else {
        None
      };
      super::lfs_cancel::check()?;
      prepared.push((object, pointer, file));
      tokio::task::yield_now().await;
    }
    stream::iter(prepared.into_iter().map(|(object, pointer, file)| {
      lfs_transfer_io::transfer(context, store.clone(), object, pointer, file, operation)
    }))
    .buffer_unordered(2)
    .try_collect::<Vec<_>>()
    .await?;
  }
  Ok(())
}

#[cfg(test)]
#[path = "lfs_transfer_tests.rs"]
mod tests;
