use super::{Bindings, failure, types::ShortcutAction};
use crate::error::BackendResult;
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub struct Modifiers {
  pub alt: bool,
  pub control: bool,
  pub meta: bool,
  pub shift: bool,
}
#[derive(Clone)]
pub struct Shortcut {
  pub action: ShortcutAction,
  pub key: String,
  pub modifiers: Modifiers,
}
const ACTIONS: &[(&str, ShortcutAction)] = &[
  ("app.commandPalette", ShortcutAction::CommandPalette),
  ("app.settings", ShortcutAction::Settings),
  ("file.new", ShortcutAction::NewFile),
  ("file.openProject", ShortcutAction::OpenProject),
  ("file.openFile", ShortcutAction::OpenFile),
  ("tab.next", ShortcutAction::NextTab),
  ("tab.previous", ShortcutAction::PreviousTab),
  ("tab.close", ShortcutAction::CloseTab),
  ("view.wysiwyg", ShortcutAction::Wysiwyg),
  ("view.source", ShortcutAction::Source),
  ("view.toggleSource", ShortcutAction::ToggleSource),
  ("view.toggleSidebar", ShortcutAction::ToggleSidebar),
  (
    "view.toggleRightSidebar",
    ShortcutAction::ToggleRightSidebar,
  ),
  ("view.toggleTerminal", ShortcutAction::ToggleTerminal),
  ("view.toggleReadonly", ShortcutAction::ToggleReadonly),
  ("view.toggleStatusBar", ShortcutAction::ToggleStatusBar),
];
pub fn compile(request: Bindings) -> BackendResult<Vec<Shortcut>> {
  let mut result = Vec::new();
  if request.bindings.iter().any(|(action, values)| {
    !ACTIONS.iter().any(|(name, _)| *name == action.as_str()) || values.len() > 4
  }) {
    return Err(failure("Invalid web tab shortcut action"));
  }
  for (name, action) in ACTIONS {
    let Some(values) = request.bindings.get(*name) else {
      continue;
    };
    if values.len() > 4 {
      return Err(failure("Invalid web tab shortcut action"));
    }
    for value in values {
      if value.is_empty() || value.len() > 64 {
        return Err(failure("Invalid web tab shortcut"));
      }
      if let Some(binding) = parse(*action, value) {
        result.push(binding);
      }
    }
  }
  Ok(result)
}
fn parse(action: ShortcutAction, value: &str) -> Option<Shortcut> {
  let mut tokens = value.split('+').map(str::trim).collect::<Vec<_>>();
  let key = normalize_key(tokens.pop()?);
  if key.is_empty() {
    return None;
  }
  let mut modifiers = Modifiers::default();
  for value in tokens {
    match value.to_lowercase().as_str() {
      "alt" | "option" => modifiers.alt = true,
      "control" | "ctrl" => modifiers.control = true,
      "meta" | "cmd" | "command" => modifiers.meta = true,
      "shift" => modifiers.shift = true,
      "mod" | "cmdorctrl" => {
        if cfg!(target_os = "macos") {
          modifiers.meta = true
        } else {
          modifiers.control = true
        }
      }
      _ => return None,
    }
  }
  let uses_mod = if cfg!(target_os = "macos") {
    modifiers.meta && !modifiers.control
  } else {
    modifiers.control && !modifiers.meta
  };
  if uses_mod
    && !modifiers.alt
    && (!modifiers.shift && ["a", "c", "f", "v", "x", "z"].contains(&key.as_str())
      || cfg!(target_os = "macos") && modifiers.shift && key == "z"
      || !cfg!(target_os = "macos") && !modifiers.shift && key == "y")
  {
    return None;
  }
  Some(Shortcut {
    action,
    key,
    modifiers,
  })
}

pub fn normalize_key(value: &str) -> String {
  match value.to_lowercase().as_str() {
    " " | "space" => "space".into(),
    "return" | "\r" => "enter".into(),
    "esc" | "\u{1b}" => "escape".into(),
    "iso_left_tab" | "\t" => "tab".into(),
    "arrowleft" | "\u{f702}" => "left".into(),
    "arrowright" | "\u{f703}" => "right".into(),
    "arrowup" | "\u{f700}" => "up".into(),
    "arrowdown" | "\u{f701}" => "down".into(),
    key => {
      if let Some(character) = key.chars().next().filter(|_| key.chars().count() == 1) {
        let code = character as u32;
        if (0xf704..=0xf71b).contains(&code) {
          return format!("f{}", code - 0xf703);
        }
      }
      key.to_owned()
    }
  }
}
#[cfg(test)]
mod tests {
  #[test]
  fn shortcut_actions_keep_the_registered_wire_names() {
    for (name, action) in super::ACTIONS {
      assert_eq!(
        serde_json::to_value(action).unwrap(),
        serde_json::json!(name)
      );
    }
  }
  #[test]
  fn native_shortcuts_preserve_web_copy_find_and_undo() {
    for key in ["Mod+C", "Mod+F", "Mod+Z"] {
      assert!(super::parse(super::ShortcutAction::CloseTab, key).is_none());
    }
    assert!(super::parse(super::ShortcutAction::CloseTab, "Mod+W").is_some());
  }
}
