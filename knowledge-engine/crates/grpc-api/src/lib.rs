pub mod knowledge {
  pub mod engine {
    pub mod v1 {
      tonic::include_proto!("knowledge.engine.v1");
    }
  }
}

pub use knowledge::engine::v1;
