fn main() -> Result<(), Box<dyn std::error::Error>> {
  let path = std::env::args_os()
    .nth(1)
    .map(std::path::PathBuf::from)
    .unwrap_or_else(|| {
      std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/generated/desktop/bindings.ts")
    });
  marklab_desktop::export_desktop_bindings(&path)
}
