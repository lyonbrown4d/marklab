use super::worker::Worker;
use crate::{
    error::{BackendError, BackendResult},
    native_window::TrustedWindow,
};
use deadpool::managed::{Manager, Metrics, Object, Pool, RecycleResult};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
#[cfg(test)]
#[path = "pool_tests.rs"]
mod tests;

pub(super) struct Slot {
    pub worker: Option<Worker>,
}
pub(super) struct SlotManager;
impl Manager for SlotManager {
    type Type = Slot;
    type Error = BackendError;
    async fn create(&self) -> BackendResult<Slot> {
        Ok(Slot { worker: None })
    }
    async fn recycle(&self, _: &mut Slot, _: &Metrics) -> RecycleResult<BackendError> {
        Ok(())
    }
}
#[derive(Clone)]
pub(in crate::link_preview) struct Workers {
    pool: Pool<SlotManager>,
    reaping: Arc<AtomicBool>,
}
pub(super) struct Lease {
    object: Option<Object<SlotManager>>,
    workers: Workers,
    clean: bool,
}
impl Workers {
    pub fn new() -> BackendResult<Self> {
        let pool = Pool::builder(SlotManager)
            .max_size(2)
            .build()
            .map_err(|_| super::network::failure("Cannot initialize preview worker pool"))?;
        Ok(Self {
            pool,
            reaping: Arc::new(AtomicBool::new(false)),
        })
    }
    pub(super) async fn checkout(
        &self,
        window: &TrustedWindow,
        generation: u64,
    ) -> BackendResult<Lease> {
        let object = self
            .pool
            .get()
            .await
            .map_err(|_| super::network::failure("Preview worker pool is closed"))?;
        let mut lease = Lease {
            object: Some(object),
            workers: self.clone(),
            clean: false,
        };
        let slot = lease
            .object
            .as_mut()
            .ok_or_else(|| super::network::failure("Missing preview worker slot"))?;
        if slot
            .worker
            .as_ref()
            .is_some_and(|worker| !worker.matches(window.label(), generation))
        {
            // A native child stays attached to its original parent. A different
            // context receives a newly created child, never the old native view.
            slot.worker = None;
        }
        if slot.worker.is_none() {
            slot.worker = Some(Worker::new(window, generation).await?);
        }
        Ok(lease)
    }
    pub fn close_window(&self, owner: &str) {
        self.pool.retain(|slot, _| {
            !slot
                .worker
                .as_ref()
                .is_some_and(|worker| worker.owner == owner)
        });
    }
    fn reap_idle(&self) {
        if self.reaping.swap(true, Ordering::AcqRel) {
            return;
        }
        let workers = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(10)).await;
                workers
                    .pool
                    .retain(|_, metrics| metrics.last_used() < Duration::from_secs(10));
                if workers.pool.status().available == 0 {
                    workers.reaping.store(false, Ordering::Release);
                    // A concurrent successful release may have skipped starting
                    // the reaper while the flag was still set.
                    if workers.pool.status().available > 0 {
                        workers.reap_idle();
                    }
                    break;
                }
            }
        });
    }
}
impl Lease {
    pub fn worker(&mut self) -> BackendResult<&mut Worker> {
        self.object
            .as_mut()
            .and_then(|slot| slot.worker.as_mut())
            .ok_or_else(|| super::network::failure("Preview worker is unavailable"))
    }
    pub async fn release(mut self) -> BackendResult<()> {
        self.worker()?.reset().await?;
        self.clean = true;
        Ok(())
    }
}
impl Drop for Lease {
    fn drop(&mut self) {
        if let Some(object) = self.object.take() {
            if self.clean {
                drop(object);
                self.workers.reap_idle();
            } else {
                drop(Object::take(object));
            }
        }
    }
}
