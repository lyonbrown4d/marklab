use super::*;
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};
use tokio::sync::watch;

struct Task {
    id: u64,
    key: Key,
    priority: Priority,
    job: Option<Operation>,
    subscribers: HashMap<String, ResultSender>,
    cancel: watch::Sender<bool>,
}
#[derive(Default)]
pub(super) struct Policy {
    sequence: u64,
    tasks: Vec<Task>,
    // A small TTL map handles cancel/promote arriving ahead of capture IPC.
    early: HashMap<(String, String), (Instant, bool)>,
    closing: Vec<(String, oneshot::Sender<()>)>,
}
impl Policy {
    pub fn apply(&mut self, command: Command) {
        match command {
            Command::Enqueue {
                key,
                id,
                priority,
                job,
                result,
            } => self.enqueue(key, id, priority, job, result),
            Command::Cancel { owner, id } => self.cancel(&owner, &id),
            Command::Promote { owner, id } => self.promote(&owner, &id),
            Command::Close { owner, closed } => {
                let mut index = 0;
                while index < self.tasks.len() {
                    if self.tasks[index].key.0 == owner {
                        self.reject(index);
                        if self.tasks[index].job.is_some() {
                            self.remove(index, Err(cancelled()));
                        } else {
                            index += 1;
                        }
                    } else {
                        index += 1;
                    }
                }
                self.early.retain(|(label, _), _| label != &owner);
                if let Some(closed) = closed {
                    self.closing.push((owner, closed));
                }
                self.acknowledge_closed();
            }
        }
    }
    fn enqueue(
        &mut self,
        key: Key,
        id: String,
        mut priority: Priority,
        job: Operation,
        result: ResultSender,
    ) {
        self.early
            .retain(|_, (time, _)| time.elapsed() < Duration::from_secs(30));
        if let Some((_, cancel)) = self.early.remove(&(key.0.clone(), id.clone())) {
            if cancel {
                let _ = result.send(Err(cancelled()));
                return;
            }
            priority = Priority::Interactive;
        }
        // IDs are per owner and cannot replace a live subscriber.
        if self
            .tasks
            .iter()
            .any(|task| task.key.0 == key.0 && task.subscribers.contains_key(&id))
        {
            let _ = result.send(Err(BackendError::new(
                "INVALID_REQUEST",
                "Duplicate preview request ID",
            )));
            return;
        }
        if let Some(task) = self
            .tasks
            .iter_mut()
            .find(|task| task.key == key && !task.subscribers.is_empty())
        {
            if task.subscribers.len() >= 128 {
                let _ = result.send(Err(full()));
                return;
            }
            if priority == Priority::Interactive {
                task.priority = priority;
            }
            task.subscribers.insert(id, result);
            return;
        }
        if self.tasks.iter().filter(|task| task.job.is_some()).count() >= 8 {
            let eviction = self
                .tasks
                .iter()
                .rposition(|task| task.job.is_some() && task.priority == Priority::Background);
            if priority == Priority::Background || eviction.is_none() {
                let _ = result.send(Err(full()));
                return;
            }
            if let Some(index) = eviction {
                self.remove(index, Err(cancelled()));
            }
        }
        let (cancel, _) = watch::channel(false);
        self.sequence += 1;
        self.tasks.push(Task {
            id: self.sequence,
            key,
            priority,
            job: Some(job),
            subscribers: HashMap::from([(id, result)]),
            cancel,
        });
    }
    pub fn start(&mut self) -> Option<(u64, Operation, watch::Receiver<bool>)> {
        let running = self.tasks.iter().filter(|task| task.job.is_none()).count();
        if running >= 2 {
            return None;
        }
        let background = self
            .tasks
            .iter()
            .any(|task| task.job.is_none() && task.priority == Priority::Background);
        let index = self
            .tasks
            .iter()
            .position(|task| task.job.is_some() && task.priority == Priority::Interactive)
            .or_else(|| {
                (!background)
                    .then(|| self.tasks.iter().position(|task| task.job.is_some()))
                    .flatten()
            })?;
        let task = &mut self.tasks[index];
        Some((task.id, task.job.take()?, task.cancel.subscribe()))
    }
    pub fn finish(&mut self, id: u64, result: BackendResult<Bytes>) {
        if let Some(index) = self
            .tasks
            .iter()
            .position(|task| task.id == id && task.job.is_none())
        {
            self.remove(index, result);
        }
        self.acknowledge_closed();
    }
    fn acknowledge_closed(&mut self) {
        let mut index = 0;
        while index < self.closing.len() {
            if self
                .tasks
                .iter()
                .any(|task| task.key.0 == self.closing[index].0)
            {
                index += 1;
            } else {
                let (_, closed) = self.closing.remove(index);
                let _ = closed.send(());
            }
        }
    }
    fn reject(&mut self, index: usize) {
        let task = &mut self.tasks[index];
        let _ = task.cancel.send(true);
        for (_, subscriber) in task.subscribers.drain() {
            let _ = subscriber.send(Err(cancelled()));
        }
    }
    fn remove(&mut self, index: usize, result: BackendResult<Bytes>) {
        let task = self.tasks.remove(index);
        let _ = task.cancel.send(true);
        for (_, subscriber) in task.subscribers {
            let _ = subscriber.send(result.clone());
        }
    }
    fn remember(&mut self, owner: &str, id: &str, cancel: bool) {
        if self.early.len() >= 128
            && let Some(key) = self
                .early
                .iter()
                .min_by_key(|(_, (time, _))| time)
                .map(|(key, _)| key.clone())
        {
            self.early.remove(&key);
        }
        let entry = self
            .early
            .entry((owner.into(), id.into()))
            .or_insert((Instant::now(), cancel));
        entry.1 |= cancel;
    }
    fn cancel(&mut self, owner: &str, id: &str) {
        let index = self
            .tasks
            .iter()
            .position(|task| task.key.0 == owner && task.subscribers.contains_key(id));
        if let Some(index) = index {
            let task = &mut self.tasks[index];
            if let Some(subscriber) = task.subscribers.remove(id) {
                let _ = subscriber.send(Err(cancelled()));
            }
            if task.subscribers.is_empty() {
                self.reject(index);
                if self.tasks[index].job.is_some() {
                    self.remove(index, Err(cancelled()));
                }
            }
        } else {
            self.remember(owner, id, true);
        }
    }
    fn promote(&mut self, owner: &str, id: &str) {
        if let Some(task) = self
            .tasks
            .iter_mut()
            .find(|task| task.key.0 == owner && task.subscribers.contains_key(id))
        {
            task.priority = Priority::Interactive;
        } else {
            self.remember(owner, id, false);
        }
    }
}
