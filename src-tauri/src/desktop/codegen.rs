use std::{fmt::Write, fs, path::Path};
use tauri_specta::{BuilderConfiguration, LanguageExt};

pub(super) struct DesktopTypescript;

#[derive(Debug, thiserror::Error)]
pub(super) enum CodegenError {
  #[error(transparent)]
  Io(#[from] std::io::Error),
  #[error(transparent)]
  Export(#[from] specta_typescript::Error),
  #[error(transparent)]
  Format(#[from] std::fmt::Error),
}

// Keep the stock Tauri Specta command bindings and append lookup types derived
// from the very same reflected command metadata. No second command list exists.
impl LanguageExt for DesktopTypescript {
  type Error = CodegenError;

  fn export(self, cfg: &BuilderConfiguration, path: &Path) -> Result<(), Self::Error> {
    specta_typescript::Typescript::default().export(cfg, path)?;
    let mut output = fs::read_to_string(path)?;
    // Events always carry the Rust serialization shape, including omitted
    // optional fields. Keep one stable public name when serde splits phases.
    let event_map = if output.contains("export type DesktopEventWirePayloads_Serialize") {
      "DesktopEventWirePayloads_Serialize"
    } else {
      "DesktopEventWirePayloads"
    };
    writeln!(output, "\nexport type DesktopEventPayloads = {event_map};")?;
    output.push_str("\nexport type DesktopCommandArgs = {\n");
    for command in &cfg.commands {
      let name = command.name();
      let camel = camel_case(name);
      writeln!(output, "  {name}: {{")?;
      for (index, (arg, _)) in command.args().iter().enumerate() {
        writeln!(
          output,
          "    {}: Parameters<typeof commands.{camel}>[{index}];",
          camel_case(arg)
        )?;
      }
      output.push_str("  };\n");
    }
    output.push_str("};\nexport type DesktopCommandResults = {\n");
    for command in &cfg.commands {
      writeln!(
        output,
        "  {}: Awaited<ReturnType<typeof commands.{}>>;",
        command.name(),
        camel_case(command.name())
      )?;
    }
    output.push_str("};\nexport type DesktopCommandName = keyof DesktopCommandArgs;\n");
    output.push_str("export const desktopCommands = {\n");
    for command in &cfg.commands {
      let name = command.name();
      let args = command
        .args()
        .iter()
        .map(|(name, _)| format!("args.{}", camel_case(name)))
        .collect::<Vec<_>>()
        .join(", ");
      writeln!(
        output,
        "  {name}: (args: DesktopCommandArgs[\"{name}\"]) => commands.{}({args}),",
        camel_case(name)
      )?;
    }
    output.push_str("} as const;\n");
    output.push_str("export const desktopCommandNames = [");
    for command in &cfg.commands {
      write!(output, "\"{}\",", command.name())?;
    }
    output.push_str("] as const;\nexport const desktopEventNames = [");
    for event in super::event_contracts::EVENT_NAMES {
      write!(output, "\"{event}\",")?;
    }
    output.push_str("] as const;\n");
    fs::write(path, output)?;
    Ok(())
  }
}

fn camel_case(name: &str) -> String {
  let mut upper = false;
  name
    .chars()
    .filter_map(|ch| {
      if ch == '_' {
        upper = true;
        None
      } else if upper {
        upper = false;
        Some(ch.to_ascii_uppercase())
      } else {
        Some(ch)
      }
    })
    .collect()
}

#[cfg(test)]
mod tests {
  #[test]
  fn export_includes_every_registered_command_and_event_with_typed_results() {
    let directory = tempfile::tempdir().expect("contract output directory");
    let path = directory.path().join("bindings.ts");
    super::super::invoke::export(&path).expect("generate desktop bindings");
    let output = std::fs::read_to_string(path).expect("generated contract");
    assert_eq!(
      output.matches(": (args: DesktopCommandArgs[\"").count(),
      197
    );
    assert_eq!(super::super::event_contracts::EVENT_NAMES.len(), 22);
    assert!(
      output.contains("export type DesktopEventPayloads = DesktopEventWirePayloads_Serialize;")
    );
    assert!(output.contains("export type DesktopCommandResults ="));
    assert!(!output.contains("Promise<any>"));
    assert!(!output.contains("bigint"));
    assert!(output.contains("session_generation: number"));
    let tree_delta = output
      .lines()
      .find(|line| line.starts_with("export type WorkspaceTreeDeltaEvent_Serialize ="))
      .expect("serialized tree event contract");
    assert!(tree_delta.contains("previousRevision: number"));
    assert!(!tree_delta.contains("state:"));
    let ready_request = output
      .split("export type ReadyRequest_Deserialize =")
      .nth(1)
      .expect("ready request input")
      .split("};")
      .next()
      .expect("ready fields");
    assert!(ready_request.contains("error?: string | null"));
    let branch_request = output
      .split("export type BranchRequest_Deserialize =")
      .nth(1)
      .expect("branch request input")
      .split("};")
      .next()
      .expect("branch fields");
    assert!(branch_request.contains("expectedRoot?: string | null"));
    assert!(branch_request.contains("startPoint?: string | null"));
    assert!(branch_request.contains("name: string"));
  }
}
