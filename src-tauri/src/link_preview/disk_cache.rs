use crate::error::{BackendError, BackendResult};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use std::{io::Write, path::PathBuf, sync::Arc, time::Duration};
use tokio::{io::AsyncReadExt, sync::Mutex};

pub(super) const MAX_IMAGE_BYTES: usize = 32 * 1024 * 1024;
const TTL_MS: i64 = 24 * 60 * 60 * 1000;
const MAX_BYTES: i64 = 200 * 1024 * 1024;

pub(super) struct DiskCache {
    pool: SqlitePool,
    root: PathBuf,
    gate: Mutex<()>,
    max_bytes: i64,
    ttl_ms: i64,
}
impl DiskCache {
    pub async fn new(pool: SqlitePool, root: PathBuf) -> BackendResult<Arc<Self>> {
        tokio::fs::create_dir_all(&root).await?;
        sqlx::query("CREATE TABLE IF NOT EXISTS web_preview_cache (cache_key TEXT PRIMARY KEY, size_bytes INTEGER NOT NULL, last_access_ms INTEGER NOT NULL)")
            .execute(&pool).await?;
        Ok(Arc::new(Self {
            pool,
            root,
            gate: Mutex::new(()),
            max_bytes: MAX_BYTES,
            ttl_ms: TTL_MS,
        }))
    }
    fn key(url: &str) -> String {
        hex::encode(Sha256::digest(format!("static-preview-v1:{url}")))
    }
    fn file(&self, key: &str) -> PathBuf {
        self.root.join(format!("{key}.png"))
    }
    async fn remove(&self, key: &str) -> BackendResult<()> {
        match tokio::fs::remove_file(self.file(key)).await {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(error) => return Err(error.into()),
        }
        sqlx::query("DELETE FROM web_preview_cache WHERE cache_key=?")
            .bind(key)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
    pub async fn get(&self, url: &str) -> BackendResult<Option<Vec<u8>>> {
        let _guard = self.gate.lock().await;
        let key = Self::key(url);
        let row = sqlx::query(
            "SELECT size_bytes,last_access_ms FROM web_preview_cache WHERE cache_key=?",
        )
        .bind(&key)
        .fetch_optional(&self.pool)
        .await?;
        let Some(row) = row else {
            return Ok(None);
        };
        let size: i64 = row.try_get("size_bytes")?;
        let accessed: i64 = row.try_get("last_access_ms")?;
        let now = crate::assets::now_ms().min(i64::MAX as u64) as i64;
        let file = self.file(&key);
        let valid = size > 0
            && size <= MAX_IMAGE_BYTES as i64
            && now.saturating_sub(accessed) <= self.ttl_ms;
        let metadata = tokio::fs::symlink_metadata(&file).await;
        if !valid || !metadata.is_ok_and(|value| value.is_file() && value.len() == size as u64) {
            self.remove(&key).await?;
            return Ok(None);
        }
        // The file is a bounded cache snapshot. Assets always get their own copy,
        // so maintenance can safely evict this path after the read finishes.
        let read = async {
            let mut bytes = Vec::with_capacity(size as usize);
            tokio::fs::File::open(file)
                .await?
                .take(MAX_IMAGE_BYTES as u64 + 1)
                .read_to_end(&mut bytes)
                .await?;
            Ok::<_, std::io::Error>(bytes)
        }
        .await;
        let bytes = match read {
            Ok(bytes) if bytes.len() == size as usize => bytes,
            _ => {
                self.remove(&key).await?;
                return Ok(None);
            }
        };
        sqlx::query("UPDATE web_preview_cache SET last_access_ms=? WHERE cache_key=?")
            .bind(now)
            .bind(key)
            .execute(&self.pool)
            .await?;
        Ok(Some(bytes))
    }
    pub async fn set(&self, url: &str, bytes: Arc<Vec<u8>>) -> BackendResult<()> {
        if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
            return Err(BackendError::new(
                "CACHE_IMAGE_SIZE",
                "Preview cache image exceeds its size limit",
            ));
        }
        let _guard = self.gate.lock().await;
        let key = Self::key(url);
        let target = self.file(&key);
        let root = self.root.clone();
        let size = bytes.len() as i64;
        crate::blocking::run(move || {
            let mut temporary = tempfile::NamedTempFile::new_in(root)?;
            temporary.write_all(&bytes)?;
            temporary.as_file().sync_all()?;
            temporary
                .persist(target)
                .map_err(|error| BackendError::from(error.error))?;
            Ok(())
        })
        .await?;
        sqlx::query("INSERT INTO web_preview_cache(cache_key,size_bytes,last_access_ms) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET size_bytes=excluded.size_bytes,last_access_ms=excluded.last_access_ms")
            .bind(key).bind(size).bind(crate::assets::now_ms().min(i64::MAX as u64) as i64).execute(&self.pool).await?;
        self.prune().await
    }
    async fn prune(&self) -> BackendResult<()> {
        let rows = sqlx::query("SELECT cache_key,size_bytes,last_access_ms FROM web_preview_cache ORDER BY last_access_ms,cache_key")
            .fetch_all(&self.pool).await?;
        let mut total = 0i64;
        for row in &rows {
            total = total.saturating_add(row.try_get::<i64, _>("size_bytes")?.max(0));
        }
        let now = crate::assets::now_ms().min(i64::MAX as u64) as i64;
        for row in rows {
            let key: String = row.try_get("cache_key")?;
            if !valid_key(&key) {
                sqlx::query("DELETE FROM web_preview_cache WHERE cache_key=?")
                    .bind(key)
                    .execute(&self.pool)
                    .await?;
                continue;
            }
            let size: i64 = row.try_get("size_bytes")?;
            let accessed: i64 = row.try_get("last_access_ms")?;
            let valid = tokio::fs::symlink_metadata(self.file(&key))
                .await
                .is_ok_and(|m| m.is_file() && m.len() == size.max(0) as u64);
            if !valid
                || size <= 0
                || size > MAX_IMAGE_BYTES as i64
                || now.saturating_sub(accessed) > self.ttl_ms
                || total > self.max_bytes
            {
                self.remove(&key).await?;
                total = total.saturating_sub(size.max(0));
            }
        }
        // Reconcile interrupted writes and rows lost after database recovery.
        // Stream directory entries instead of retaining another full file list.
        let mut directory = tokio::fs::read_dir(&self.root).await?;
        while let Some(entry) = directory.next_entry().await? {
            let filename = entry.file_name();
            let name = filename.to_string_lossy();
            let key = name.strip_suffix(".png");
            let keep = if let Some(key) = key.filter(|key| valid_key(key)) {
                sqlx::query_scalar::<_, i64>("SELECT 1 FROM web_preview_cache WHERE cache_key=?")
                    .bind(key)
                    .fetch_optional(&self.pool)
                    .await?
                    .is_some()
            } else {
                false
            };
            if !keep && entry.file_type().await?.is_file() {
                tokio::fs::remove_file(entry.path()).await?;
            }
        }
        Ok(())
    }
    pub async fn touch(&self, url: &str) -> BackendResult<()> {
        let _guard = self.gate.lock().await;
        sqlx::query("UPDATE web_preview_cache SET last_access_ms=? WHERE cache_key=?")
            .bind(crate::assets::now_ms().min(i64::MAX as u64) as i64)
            .bind(Self::key(url))
            .execute(&self.pool)
            .await?;
        Ok(())
    }
    pub async fn invalidate(&self, url: &str) -> BackendResult<()> {
        let _guard = self.gate.lock().await;
        self.remove(&Self::key(url)).await
    }
    pub async fn maintain(&self) -> BackendResult<()> {
        let _guard = self.gate.lock().await;
        self.prune().await
    }
    pub fn schedule(cache: &Arc<Self>) -> tokio::task::AbortHandle {
        let weak = Arc::downgrade(cache);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(30)).await;
            loop {
                let Some(cache) = weak.upgrade() else {
                    break;
                };
                if let Err(error) = cache.maintain().await {
                    log::warn!("Preview cache maintenance failed: {}", error.code);
                }
                drop(cache);
                tokio::time::sleep(Duration::from_secs(6 * 60 * 60)).await;
            }
        })
        .abort_handle()
    }
}
fn valid_key(key: &str) -> bool {
    key.len() == 64 && key.bytes().all(|c| c.is_ascii_hexdigit())
}

#[cfg(test)]
#[path = "disk_cache_tests.rs"]
mod tests;
