use super::Request;
use std::collections::{HashMap, VecDeque};
const MAX_ACTIVE: usize = 256;

pub(super) struct Entry {
    pub token: String,
    pub request: Request,
}
#[derive(Default)]
pub(super) struct Active {
    entries: HashMap<String, Entry>,
    order: VecDeque<String>,
}
impl Active {
    pub fn replacements(&self, id: &str) -> Vec<String> {
        if self.entries.contains_key(id) {
            vec![id.into()]
        } else if self.entries.len() >= MAX_ACTIVE {
            self.order.front().cloned().into_iter().collect()
        } else {
            Vec::new()
        }
    }
    pub fn remove(&mut self, id: &str) {
        self.entries.remove(id);
        self.order.retain(|old| old != id);
    }
    pub fn insert(&mut self, token: String, request: Request) -> Vec<String> {
        let id = request.id.clone();
        let mut close = Vec::new();
        if self.entries.remove(&id).is_some() {
            close.push(id.clone());
            self.order.retain(|old| old != &id);
        }
        if self.entries.len() >= MAX_ACTIVE
            && let Some(oldest) = self.order.pop_front()
        {
            self.entries.remove(&oldest);
            close.push(oldest);
        }
        self.order.push_back(id.clone());
        self.entries.insert(id, Entry { token, request });
        close
    }
    pub fn take(&mut self, token: &str) -> Option<Request> {
        let id = self
            .entries
            .iter()
            .find(|(_, entry)| entry.token == token)?
            .0
            .clone();
        self.order.retain(|old| old != &id);
        self.entries.remove(&id).map(|entry| entry.request)
    }
    pub fn ids(&self) -> Vec<String> {
        self.entries.keys().cloned().collect()
    }
}
