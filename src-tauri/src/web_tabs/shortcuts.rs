use super::{Bindings, failure};
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
    pub action: String,
    pub key: String,
    pub modifiers: Modifiers,
}
const ACTIONS: &[&str] = &[
    "app.commandPalette",
    "app.settings",
    "file.new",
    "file.openProject",
    "file.openFile",
    "tab.next",
    "tab.previous",
    "tab.close",
    "view.wysiwyg",
    "view.source",
    "view.toggleSource",
    "view.toggleSidebar",
    "view.toggleRightSidebar",
    "view.toggleTerminal",
    "view.toggleReadonly",
    "view.toggleStatusBar",
];
pub fn compile(request: Bindings) -> BackendResult<Vec<Shortcut>> {
    let mut result = Vec::new();
    if request
        .bindings
        .iter()
        .any(|(action, values)| !ACTIONS.contains(&action.as_str()) || values.len() > 4)
    {
        return Err(failure("Invalid web tab shortcut action"));
    }
    for action in ACTIONS {
        let Some(values) = request.bindings.get(*action) else {
            continue;
        };
        if values.len() > 4 {
            return Err(failure("Invalid web tab shortcut action"));
        }
        for value in values {
            if value.is_empty() || value.len() > 64 {
                return Err(failure("Invalid web tab shortcut"));
            }
            if let Some(binding) = parse(action, value) {
                result.push(binding);
            }
        }
    }
    Ok(result)
}
fn parse(action: &str, value: &str) -> Option<Shortcut> {
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
        action: action.into(),
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
    fn native_shortcuts_preserve_web_copy_find_and_undo() {
        for key in ["Mod+C", "Mod+F", "Mod+Z"] {
            assert!(super::parse("tab.close", key).is_none());
        }
        assert!(super::parse("tab.close", "Mod+W").is_some());
    }
}
