use specta::{Types, datatype::Function};
use specta_serde::Phase;
use specta_typescript::{Exporter, FrameworkExporter};
use std::{fmt::Write, fs, path::Path};

#[path = "codegen_types.rs"]
mod wire;

#[derive(Debug, thiserror::Error)]
pub(super) enum CodegenError {
  #[error(transparent)]
  Io(#[from] std::io::Error),
  #[error(transparent)]
  Export(#[from] specta_typescript::Error),
  #[error(transparent)]
  Format(#[from] std::fmt::Error),
}

// Both callable bindings and lookup types use the sole desktop command inventory.
pub(super) fn export(
  mut types: Types,
  commands: Vec<Function>,
  path: &Path,
) -> Result<(), CodegenError> {
  types.register_mut::<super::event_contracts::DesktopEventPayloads>();
  wire::hide_transport_result(&mut types, &commands);
  let reflected = commands.clone();
  let mut output = Exporter::from(specta_typescript::Typescript::default())
    .framework_runtime(move |exporter| render_commands(exporter, &reflected).map(Into::into))
    .export(&types, wire::WireFormat)?;
  // Events always carry the Rust serialization shape, including omitted
  // optional fields. Keep one stable public name when serde splits phases.
  let event_map = if output.contains("export type DesktopEventWirePayloads_Serialize") {
    "DesktopEventWirePayloads_Serialize"
  } else {
    "DesktopEventWirePayloads"
  };
  writeln!(output, "\nexport type DesktopEventPayloads = {event_map};")?;
  output.push_str("\nexport type DesktopCommandArgs = {\n");
  for command in &commands {
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
  for command in &commands {
    writeln!(
      output,
      "  {}: Awaited<ReturnType<typeof commands.{}>>;",
      command.name(),
      camel_case(command.name())
    )?;
  }
  output.push_str("};\nexport type DesktopCommandName = keyof DesktopCommandArgs;\n");
  output.push_str("export const desktopCommands = {\n");
  for command in &commands {
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
  for command in &commands {
    write!(output, "\"{}\",", command.name())?;
  }
  output.push_str("] as const;\nexport const desktopEventNames = [");
  for event in super::event_contracts::EVENT_NAMES {
    write!(output, "\"{event}\",")?;
  }
  output.push_str("] as const;\n");
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(path, output)?;
  Ok(())
}

fn render_commands(
  exporter: FrameworkExporter<'_>,
  commands: &[Function],
) -> Result<String, specta_typescript::Error> {
  let mut output = String::from(
    "import { invoke as __TAURI_INVOKE } from \"@tauri-apps/api/core\";\n\nexport const commands = {\n",
  );
  for command in commands {
    let mut arguments = Vec::new();
    let mut names = Vec::new();
    for (name, dt) in command.args() {
      let name = camel_case(name);
      let dt = specta_serde::select_phase_datatype(dt, exporter.types, Phase::Deserialize);
      arguments.push(format!("{name}: {}", exporter.reference(&dt)?));
      names.push(name);
    }
    let result = match command.result() {
      Some(dt) => {
        let dt = wire::success(dt, exporter.types);
        let dt = specta_serde::select_phase_datatype(dt, exporter.types, Phase::Serialize);
        exporter.reference(&dt)?
      }
      None => "void".into(),
    };
    let payload = if names.is_empty() {
      String::new()
    } else {
      format!(", {{ {} }}", names.join(", "))
    };
    output.push_str(&format!(
      "  {}: ({}) => __TAURI_INVOKE<{result}>(\"{}\"{payload}),\n",
      camel_case(command.name()),
      arguments.join(", "),
      command.name(),
    ));
  }
  output.push_str("};\n");
  Ok(output)
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
  #[specta::specta]
  fn nested_result(request: Result<u64, String>) -> Result<Result<u64, String>, String> {
    Ok(request)
  }

  #[test]
  fn nested_results_keep_their_data_shape_after_transport_unwrapping() {
    let mut types = specta::Types::default();
    let commands = specta::function::collect_functions![nested_result](&mut types);
    let directory = tempfile::tempdir().expect("contract output directory");
    let path = directory.path().join("bindings.ts");
    super::export(types, commands, &path).expect("generate nested Result bindings");
    let output = std::fs::read_to_string(path).expect("generated contract");
    assert!(output.contains(
      "nestedResult: (request: Result<number, string>) => __TAURI_INVOKE<Result<number, string>>(\"nested_result\", { request })"
    ));
    assert!(output.contains("export type Result<"));
  }

  #[test]
  fn export_includes_every_registered_command_and_event_with_typed_results() {
    let directory = tempfile::tempdir().expect("contract output directory");
    let path = directory.path().join("bindings.ts");
    super::super::invoke::export(&path).expect("generate desktop bindings");
    let output = std::fs::read_to_string(path).expect("generated contract");
    assert_eq!(
      output.matches(": (args: DesktopCommandArgs[\"").count(),
      199
    );
    assert_eq!(super::super::event_contracts::EVENT_NAMES.len(), 23);
    assert!(
      output.contains("export type DesktopEventPayloads = DesktopEventWirePayloads_Serialize;")
    );
    assert!(output.contains("export type DesktopCommandResults ="));
    assert!(output.contains(
      "aiGenerateText: (request: GenerateRequest_Deserialize) => __TAURI_INVOKE<GenerateResult_Serialize>(\"ai_generate_text\", { request })"
    ));
    assert!(output.contains(
      "windowCloseCommit: (request: WorkspaceEmptyRequest) => __TAURI_INVOKE<null>(\"window_close_commit\", { request })"
    ));
    assert!(!output.contains("export type Result<"));
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
