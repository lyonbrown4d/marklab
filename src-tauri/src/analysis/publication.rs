use super::{
  Index,
  graph::summary,
  graph_types::{PublicationChapter, PublicationPlan},
};
use std::collections::{BTreeMap, BTreeSet};

pub fn publication(index: &Index) -> PublicationPlan {
  let mut incoming = BTreeMap::<String, usize>::new();
  for path in index.files.keys() {
    incoming.insert(path.clone(), 0);
  }
  for document in index.files.values() {
    for target in adjacent(index, &document.path) {
      *incoming.entry(target).or_default() += 1;
    }
  }
  let mut paths: Vec<_> = index.files.keys().cloned().collect();
  paths.sort_by_key(|path| (!entry(path), path.clone()));
  let primary = paths
    .iter()
    .find(|path| incoming.get(*path) == Some(&0))
    .cloned();
  let mut visited = BTreeSet::new();
  let mut ordered = Vec::new();
  if let Some(primary) = primary {
    visit(index, &primary, 0, false, &mut visited, &mut ordered);
  }
  for path in paths {
    visit(index, &path, 0, true, &mut visited, &mut ordered);
  }
  let chapters: Vec<_> = ordered
    .into_iter()
    .filter_map(|(path, depth, orphaned)| {
      index.files.get(&path).map(|file| PublicationChapter {
        path: path.clone(),
        title: file.title.clone(),
        depth,
        orphaned,
        word_count: file.word_count,
        estimated_pages: file.word_count.div_ceil(430).max(1),
        excerpt: summary(file).chars().take(220).collect(),
      })
    })
    .collect();
  PublicationPlan {
    title: std::path::Path::new(&index.root)
      .file_name()
      .map(|name| name.to_string_lossy().into_owned())
      .unwrap_or_default(),
    estimated_pages: chapters
      .iter()
      .map(|chapter| chapter.estimated_pages)
      .sum::<usize>()
      + 2,
    orphan_count: chapters.iter().filter(|chapter| chapter.orphaned).count(),
    total_words: index.files.values().map(|file| file.word_count).sum(),
    chapters,
  }
}

fn visit(
  index: &Index,
  path: &str,
  depth: usize,
  orphaned: bool,
  visited: &mut BTreeSet<String>,
  ordered: &mut Vec<(String, usize, bool)>,
) {
  // Explicit stack avoids recursive traversal of adversarial link chains.
  let mut pending = vec![(path.to_owned(), depth)];
  while let Some((path, depth)) = pending.pop() {
    if !visited.insert(path.clone()) {
      continue;
    }
    ordered.push((path.clone(), depth.min(2), orphaned));
    let mut next = adjacent(index, &path);
    next.reverse();
    pending.extend(next.into_iter().map(|path| (path, depth + 1)));
  }
}
fn adjacent(index: &Index, path: &str) -> Vec<String> {
  let mut seen = BTreeSet::new();
  index
    .files
    .get(path)
    .into_iter()
    .flat_map(|file| &file.links)
    .filter_map(|link| link.target_path.as_ref())
    .filter(|target| {
      target.as_str() != path && index.files.contains_key(*target) && seen.insert((*target).clone())
    })
    .cloned()
    .collect()
}
fn entry(path: &str) -> bool {
  std::path::Path::new(path).file_stem().is_some_and(|stem| {
    [
      "readme",
      "index",
      "home",
      "intro",
      "introduction",
      "overview",
    ]
    .contains(&stem.to_string_lossy().to_lowercase().as_str())
  })
}
