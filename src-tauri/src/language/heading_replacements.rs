use crate::analysis::document::Heading;
use std::collections::HashSet;

const MAX_COMPARISON_CHARACTERS: usize = 128;

pub(super) fn closest<'a>(anchor: &str, headings: &'a [Heading]) -> Vec<&'a Heading> {
  let target = comparable(anchor);
  let mut seen = HashSet::new();
  let mut ranked = Vec::with_capacity(4);
  for (index, heading) in headings.iter().enumerate() {
    if heading.slug.is_empty() || !seen.insert(heading.slug.as_str()) {
      continue;
    }
    let score = distance(&target, &comparable(&heading.slug))
      .min(distance(&target, &comparable(&heading.text)));
    ranked.push((score, index, heading));
    ranked.sort_by(|left, right| left.0.total_cmp(&right.0).then(left.1.cmp(&right.1)));
    ranked.truncate(3);
  }
  ranked.into_iter().map(|(_, _, heading)| heading).collect()
}

fn comparable(value: &str) -> String {
  let mut output = String::new();
  let mut separator = false;
  // Bound the quadratic edit-distance input, including Unicode lowercasing.
  for character in value
    .trim()
    .chars()
    .flat_map(char::to_lowercase)
    .take(MAX_COMPARISON_CHARACTERS)
  {
    if character.is_whitespace() || character == '_' {
      if !separator {
        output.push('-');
      }
      separator = true;
    } else {
      output.push(character);
      separator = false;
    }
  }
  output
}

fn distance(left: &str, right: &str) -> f64 {
  let maximum = left.chars().count().max(right.chars().count());
  if maximum == 0 {
    0.0
  } else {
    strsim::levenshtein(left, right) as f64 / maximum as f64
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn comparable_normalizes_separators_and_bounds_large_unicode_inputs() {
    assert_eq!(comparable("  Hello__ \tWORLD  "), "hello-world");
    let bounded = comparable(&"界".repeat(100_000));
    assert_eq!(bounded.chars().count(), MAX_COMPARISON_CHARACTERS);
    assert_eq!(distance("same", "same"), 0.0);
    assert_eq!(distance("", ""), 0.0);
  }
}
