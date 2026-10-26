use super::super::*;
use x11rb::{
  connection::Connection,
  protocol::xproto::{ConnectionExt, ModMask},
  rust_connection::RustConnection,
};

#[derive(Clone)]
pub(super) struct Grab {
  pub code: u8,
  pub mask: ModMask,
  pub binding: shortcuts::Shortcut,
}
impl Grab {
  pub fn same_key(&self, other: &Self) -> bool {
    self.code == other.code && self.mask == other.mask
  }
}

pub(super) fn compile(
  conn: &RustConnection,
  bindings: &[shortcuts::Shortcut],
) -> BackendResult<Vec<Grab>> {
  let setup = conn.setup();
  let first = setup.min_keycode;
  let count = setup.max_keycode.saturating_sub(first).saturating_add(1);
  let mapping = conn
    .get_keyboard_mapping(first, count)
    .map_err(|_| failure("Cannot read native shortcut key map"))?
    .reply()
    .map_err(|_| failure("Cannot read native shortcut key map"))?;
  let per_key = usize::from(mapping.keysyms_per_keycode);
  if per_key == 0 {
    return Err(failure("Native shortcut key map is empty"));
  }
  let modifiers = conn
    .get_modifier_mapping()
    .map_err(|_| failure("Cannot read native shortcut modifiers"))?
    .reply()
    .map_err(|_| failure("Cannot read native shortcut modifiers"))?;
  let modifier_width = modifiers.keycodes.len() / 8;
  let modifier_for = |symbols: &[u32]| -> u16 {
    if modifier_width == 0 {
      return 0;
    }
    modifiers
      .keycodes
      .chunks(modifier_width)
      .enumerate()
      .fold(0, |mask, (index, codes)| {
        let matched = codes.iter().any(|code| {
          code
            .checked_sub(first)
            .and_then(|index| mapping.keysyms.chunks(per_key).nth(index as usize))
            .is_some_and(|keys| keys.iter().any(|key| symbols.contains(key)))
        });
        mask | if matched { 1 << index } else { 0 }
      })
  };
  let alt = modifier_for(&[0xffe9, 0xffea]);
  let super_mask = modifier_for(&[0xffeb, 0xffec]);
  let meta = if super_mask != 0 {
    super_mask
  } else {
    modifier_for(&[0xffe7, 0xffe8])
  };
  let locks = modifier_for(&[0xffe5, 0xff7f, 0xff14]);
  let lock_bits = (0..8)
    .filter(|bit| locks & (1 << bit) != 0)
    .map(|bit| 1u16 << bit)
    .collect::<Vec<_>>();
  let mut grabs = Vec::new();
  for binding in bindings {
    let desired = symbol(&binding.key)
      .ok_or_else(|| failure("Web tab shortcut key is unsupported by the native Linux key map"))?;
    if binding.modifiers.alt && alt == 0 || binding.modifiers.meta && meta == 0 {
      return Err(failure(
        "Web tab shortcut modifier is unavailable on this keyboard",
      ));
    }
    let modifiers = modifier_options(binding.modifiers.alt, alt)
      .into_iter()
      .flat_map(|alt| {
        modifier_options(binding.modifiers.meta, meta)
          .into_iter()
          .map(move |meta| {
            u16::from(binding.modifiers.shift)
              | (u16::from(binding.modifiers.control) << 2)
              | alt
              | meta
          })
      })
      .collect::<Vec<_>>();
    let mut found = false;
    for (index, keys) in mapping.keysyms.chunks(per_key).enumerate() {
      if selected_symbol(keys, binding.modifiers.shift) != desired {
        continue;
      }
      found = true;
      for mask in &modifiers {
        for combination in 0..(1usize << lock_bits.len()) {
          let mask = lock_bits
            .iter()
            .enumerate()
            .fold(*mask, |mask, (index, bit)| {
              mask
                | if combination & (1 << index) != 0 {
                  *bit
                } else {
                  0
                }
            });
          let grab = Grab {
            code: first + index as u8,
            mask: ModMask::from(mask),
            binding: binding.clone(),
          };
          if !grabs.iter().any(|existing: &Grab| existing.same_key(&grab)) {
            grabs.push(grab);
          }
        }
      }
    }
    if !found {
      return Err(failure(
        "Web tab shortcut key is unavailable on this keyboard",
      ));
    }
  }
  Ok(grabs)
}
fn modifier_options(required: bool, available: u16) -> Vec<u16> {
  if !required {
    return vec![0];
  }
  (0..8)
    .map(|bit| 1u16 << bit)
    .filter(|bit| available & bit != 0)
    .collect()
}
fn selected_symbol(keys: &[u32], shift: bool) -> u32 {
  let selected = if shift {
    keys.get(1).filter(|symbol| **symbol != 0)
  } else {
    None
  };
  lowercase(*selected.unwrap_or(&keys[0]))
}
fn lowercase(symbol: u32) -> u32 {
  if symbol == 0xfe20 {
    return 0xff09;
  }
  let unicode = if symbol & 0xff000000 == 0x01000000 {
    symbol & 0x00ffffff
  } else {
    symbol
  };
  char::from_u32(unicode)
    .filter(|_| unicode < 0xff00)
    .and_then(|character| character.to_lowercase().next())
    .map(|character| {
      if character as u32 > 255 {
        0x01000000 | character as u32
      } else {
        character as u32
      }
    })
    .unwrap_or(symbol)
}
fn symbol(key: &str) -> Option<u32> {
  Some(match key {
    "space" => 0x20,
    "enter" => 0xff0d,
    "escape" => 0xff1b,
    "tab" => 0xff09,
    "left" => 0xff51,
    "up" => 0xff52,
    "right" => 0xff53,
    "down" => 0xff54,
    "backspace" => 0xff08,
    "delete" => 0xffff,
    "insert" => 0xff63,
    "home" => 0xff50,
    "end" => 0xff57,
    "pageup" => 0xff55,
    "pagedown" => 0xff56,
    value
      if value.starts_with('f')
        && value[1..]
          .parse::<u32>()
          .is_ok_and(|n| (1..=24).contains(&n)) =>
    {
      0xffbd + value[1..].parse::<u32>().ok()?
    }
    value if value.chars().count() == 1 => {
      let value = value.chars().next()? as u32;
      if value > 255 {
        0x01000000 | value
      } else {
        value
      }
    }
    _ => return None,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn native_symbols_preserve_shifted_text_and_named_shortcuts() {
    assert_eq!(
      selected_symbol(&[b'a' as u32, b'A' as u32], false),
      symbol("a").unwrap()
    );
    assert_eq!(
      selected_symbol(&[b'a' as u32, b'A' as u32], true),
      symbol("a").unwrap()
    );
    assert_eq!(
      selected_symbol(&[b'/' as u32, b'?' as u32], true),
      symbol("?").unwrap()
    );
    assert_ne!(
      selected_symbol(&[b'/' as u32, b'?' as u32], true),
      symbol("/").unwrap()
    );
    assert_eq!(
      selected_symbol(&[0xff09, 0xfe20], true),
      symbol("tab").unwrap()
    );
    assert_eq!(symbol("f1"), Some(0xffbe));
    assert_eq!(symbol("f24"), Some(0xffd5));
    assert_eq!(symbol("f25"), None);
    assert_eq!(symbol("unrecognized"), None);
    assert_eq!(modifier_options(true, 0x48), [8, 64]);
    assert_eq!(modifier_options(false, 0x48), [0]);
  }
}
