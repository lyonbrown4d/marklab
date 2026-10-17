use super::search_matches::{check, complex};
use crate::error::{BackendError, BackendResult};
use regex::Regex;
use std::{
    collections::HashMap,
    sync::{OnceLock, atomic::AtomicBool},
};

pub(super) struct FuzzyBudget {
    pub remaining: usize,
    memo: HashMap<String, HashMap<String, bool>>,
    entries: usize,
}

impl FuzzyBudget {
    pub fn new(remaining: usize) -> Self {
        Self {
            remaining,
            memo: HashMap::new(),
            entries: 0,
        }
    }

    pub fn find(
        &mut self,
        texts: &[&str],
        term: &str,
        cancelled: &AtomicBool,
    ) -> BackendResult<Option<String>> {
        if !fuzzy(term)? {
            return Ok(None);
        }
        let size = term.chars().count();
        if size > 128 {
            return Err(complex());
        }
        let maximum = (size / 5).max(1);
        let expression = words()?;
        for text in texts {
            for word in expression.find_iter(text) {
                check(cancelled)?;
                let word = word.as_str();
                let length = word.chars().count();
                if length.abs_diff(size) > maximum {
                    continue;
                }
                if length > 128 {
                    return Err(complex());
                }
                let matches = match self.memo.get(term).and_then(|words| words.get(word)) {
                    Some(matches) => *matches,
                    None => {
                        self.remaining = self
                            .remaining
                            .checked_sub(length * size)
                            .ok_or_else(complex)?;
                        let matches = strsim::levenshtein(word, term) <= maximum;
                        // Query-local memo prevents repeated corpus vocabulary from
                        // exhausting the DP budget. Memory never grows past 8192 pairs.
                        if self.entries < 8192 {
                            self.memo
                                .entry(term.to_owned())
                                .or_default()
                                .insert(word.to_owned(), matches);
                            self.entries += 1;
                        }
                        matches
                    }
                };
                if matches {
                    return Ok(Some(word.to_owned()));
                }
            }
        }
        Ok(None)
    }
}

fn words() -> BackendResult<&'static Regex> {
    static WORDS: OnceLock<Result<Regex, regex::Error>> = OnceLock::new();
    WORDS
        .get_or_init(|| Regex::new(r"[\p{Letter}\p{Number}]+"))
        .as_ref()
        .map_err(|_| BackendError::new("SEARCH_FAILED", "Cannot initialize word matcher"))
}

fn fuzzy(term: &str) -> BackendResult<bool> {
    static CJK: OnceLock<Result<Regex, regex::Error>> = OnceLock::new();
    let cjk = CJK
        .get_or_init(|| Regex::new(r"[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}]"))
        .as_ref()
        .map_err(|_| BackendError::new("SEARCH_FAILED", "Cannot initialize script matcher"))?;
    Ok(term.chars().count() >= 5 && term.chars().all(char::is_alphanumeric) && !cjk.is_match(term))
}
