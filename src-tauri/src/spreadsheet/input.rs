use super::{ReadPageRequest, limits};
use crate::{assets::AssetService, error::BackendResult, workspace::Workspace};
use sha2::{Digest, Sha256};
use std::{
  fs::{File, Metadata},
  io::{Cursor, Read, Seek, SeekFrom},
  path::Path,
};

#[derive(Clone, Copy)]
pub enum Format {
  Csv,
  Tsv,
  Xlsx,
}

pub enum NativeInput {
  File(File, Metadata),
  Bytes(Cursor<Vec<u8>>),
}

pub struct Prepared {
  pub reader: NativeInput,
  pub identity: String,
  pub format: Format,
}

impl Prepared {
  pub fn snapshot(mut self) -> BackendResult<Self> {
    self.reader = NativeInput::Bytes(Cursor::new(self.reader.into_bytes()?));
    Ok(self)
  }
}

pub fn prepare(
  owner: &str,
  workspace: &Workspace,
  assets: &AssetService,
  request: &ReadPageRequest,
) -> BackendResult<Prepared> {
  let format = match Path::new(&request.path)
    .extension()
    .and_then(|extension| extension.to_str())
    .unwrap_or("")
    .to_ascii_lowercase()
    .as_str()
  {
    "csv" => Format::Csv,
    "tsv" => Format::Tsv,
    "xlsx" | "xlsm" => Format::Xlsx,
    _ => {
      return Err(limits::invalid(
        "Supported spreadsheets are CSV, TSV, XLSX and XLSM",
      ));
    }
  };
  if let Some(source) = &request.source {
    if matches!(format, Format::Xlsx) {
      return Err(limits::invalid(
        "Editor content is only supported for CSV and TSV",
      ));
    }
    // Editor content is still scoped to a valid document in this window.
    workspace.resolve(&request.path)?;
    return Ok(Prepared {
      identity: hex::encode(Sha256::digest(source.as_bytes())),
      reader: NativeInput::Bytes(Cursor::new(source.as_bytes().to_vec())),
      format,
    });
  }
  if let Some(url) = &request.asset_url {
    // The existing capability service verifies owner, expiry, file identity
    // and snapshot metadata. Check its length before requesting any bytes.
    assets.resolve_capability_path(owner, url)?;
    let token = url
      .rsplit('/')
      .next()
      .ok_or_else(|| limits::invalid("Invalid snapshot"))?;
    let (_, _, _, length) = assets.serve(owner, token, None, true)?;
    if length > limits::MAX_FILE_BYTES {
      return Err(limits::error(
        "Spreadsheet exceeds the 16 MiB preview limit",
      ));
    }
    let (bytes, _, _, _) = assets.serve(owner, token, None, false)?;
    return Ok(Prepared {
      identity: format!("{url}:{}", hex::encode(Sha256::digest(&bytes))),
      reader: NativeInput::Bytes(Cursor::new(bytes)),
      format,
    });
  }
  let path = workspace.resolve(&request.path)?;
  let file = File::open(path)?;
  let metadata = file.metadata()?;
  if !metadata.is_file() {
    return Err(limits::invalid("Spreadsheet is not a regular file"));
  }
  if metadata.len() > limits::MAX_FILE_BYTES {
    return Err(limits::error(
      "Spreadsheet exceeds the 16 MiB preview limit",
    ));
  }
  let identity = format!(
    "{}:{:?}:{:?}",
    metadata.len(),
    metadata.modified()?,
    metadata.created().ok()
  );
  Ok(Prepared {
    reader: NativeInput::File(file, metadata),
    identity,
    format,
  })
}

impl NativeInput {
  pub fn into_bytes(self) -> BackendResult<Vec<u8>> {
    match self {
      Self::Bytes(bytes) => Ok(bytes.into_inner()),
      mut file @ Self::File(_, _) => {
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;
        file.verify()?;
        Ok(bytes)
      }
    }
  }

  pub fn verify(&self) -> BackendResult<()> {
    if let Self::File(file, before) = self {
      let after = file.metadata()?;
      if after.len() != before.len() || after.modified()? != before.modified()? {
        return Err(limits::invalid(
          "Spreadsheet changed during preview; try again",
        ));
      }
    }
    Ok(())
  }
}

impl Read for NativeInput {
  fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
    match self {
      Self::File(file, metadata) => {
        // A file growing after metadata inspection must never bypass
        // the input budget, even before the final identity check.
        let remaining = metadata.len().saturating_sub(file.stream_position()?);
        let count = buffer.len().min(remaining as usize);
        file.read(&mut buffer[..count])
      }
      Self::Bytes(bytes) => bytes.read(buffer),
    }
  }
}

impl Seek for NativeInput {
  fn seek(&mut self, position: SeekFrom) -> std::io::Result<u64> {
    match self {
      Self::File(file, _) => file.seek(position),
      Self::Bytes(bytes) => bytes.seek(position),
    }
  }
}
