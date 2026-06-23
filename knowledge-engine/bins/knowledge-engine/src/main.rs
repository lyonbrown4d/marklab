fn main() {
  if let Err(error) = marklab_knowledge_rpc_server::run_stdio() {
    eprintln!("knowledge engine failed: {error}");
    std::process::exit(1);
  }
}
