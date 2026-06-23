use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
  let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR")?);
  let proto_root = manifest_dir.join("../../proto");
  let proto_file = proto_root.join("knowledge/engine/v1/engine.proto");
  let protoc = protoc_bin_vendored::protoc_bin_path()?;

  std::env::set_var("PROTOC", protoc);
  println!("cargo:rerun-if-changed={}", proto_root.display());
  println!("cargo:rerun-if-changed={}", proto_file.display());

  tonic_prost_build::configure()
    .build_client(true)
    .build_server(true)
    .compile_protos(&[proto_file], &[proto_root])?;

  Ok(())
}
