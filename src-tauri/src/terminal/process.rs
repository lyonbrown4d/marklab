use super::*;
pub(super) struct SpawnRequest {
    pub owner: String,
    pub cwd: std::path::PathBuf,
    pub rows: i64,
    pub cols: i64,
    pub shell_path: Option<String>,
    pub epoch: u64,
}
pub(super) fn create(
    window: WebviewWindow,
    state: TerminalState,
    request: SpawnRequest,
) -> BackendResult<SessionInfo> {
    let SpawnRequest {
        owner,
        cwd,
        rows,
        cols,
        shell_path,
        epoch,
    } = request;
    if state.epoch(&owner)? != epoch {
        return Err(failure("Terminal window changed while opening"));
    }
    if state
        .sessions
        .lock()
        .map_err(failure)?
        .values()
        .filter(|s| s.owner == owner)
        .count()
        >= 16
    {
        return Err(failure("Close a terminal before opening another session"));
    }
    let shell = shell::resolve(shell_path.as_deref())?;
    let pair = native_pty_system()
        .openpty(size(rows, cols))
        .map_err(failure)?;
    let mut command = CommandBuilder::new(&shell);
    command.cwd(&cwd);
    shell::environment(&mut command);
    let mut reader = pair.master.try_clone_reader().map_err(failure)?;
    let writer = pair.master.take_writer().map_err(failure)?;
    let mut child = pair.slave.spawn_command(command).map_err(failure)?;
    drop(pair.slave);
    let id = format!("terminal-{}", uuid::Uuid::new_v4());
    let info = SessionInfo {
        id: id.clone(),
        shell: shell.to_string_lossy().into(),
        cwd: cwd.to_string_lossy().into(),
    };
    let session = Arc::new(Session {
        owner,
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        killer: Mutex::new(child.clone_killer()),
        input_gate: Arc::new(tokio::sync::Semaphore::new(1)),
    });
    {
        let owners = match state.owners.lock() {
            Ok(value) => value,
            Err(error) => {
                let _ = child.kill();
                return Err(failure(error));
            }
        };
        if state.stopped.load(Ordering::Acquire)
            || owners
                .get(&session.owner)
                .is_none_or(|current| current.closed || current.generation != epoch)
        {
            let _ = child.kill();
            return Err(failure("Terminal window has closed"));
        }
        let mut sessions = match state.sessions.lock() {
            Ok(value) => value,
            Err(e) => {
                let _ = child.kill();
                return Err(failure(e));
            }
        };
        if sessions
            .values()
            .filter(|s| s.owner == session.owner)
            .count()
            >= 16
        {
            let _ = child.kill();
            return Err(failure("Close a terminal before opening another session"));
        }
        sessions.insert(id.clone(), session);
    }
    let output_window = window.clone();
    let output_id = id.clone();
    let output_thread = std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        let mut pending = Vec::new();
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => {
                    pending.extend_from_slice(&buffer[..count]);
                    let data = drain_utf8(&mut pending, false);
                    if !data.is_empty()
                        && output_window
                            .emit_to(
                                tauri::EventTarget::webview_window(output_window.label()),
                                "terminal-output",
                                Output {
                                    id: output_id.clone(),
                                    data,
                                },
                            )
                            .is_err()
                    {
                        break;
                    }
                }
            }
        }
        let data = drain_utf8(&mut pending, true);
        if !data.is_empty() {
            let _ = output_window.emit_to(
                tauri::EventTarget::webview_window(output_window.label()),
                "terminal-output",
                Output {
                    id: output_id,
                    data,
                },
            );
        }
    });
    std::thread::spawn(move || {
        let status = child.wait();
        let _ = output_thread.join();
        if let Ok(mut sessions) = state.sessions.lock() {
            sessions.remove(&id);
        }
        let (exit_code, signal) = match status {
            Ok(value) => (Some(value.exit_code()), value.signal().map(str::to_owned)),
            Err(_) => (None, Some("PTY wait failed".into())),
        };
        let _ = window.emit_to(
            tauri::EventTarget::webview_window(window.label()),
            "terminal-exit",
            Exit {
                id,
                exit_code,
                signal,
            },
        );
    });
    Ok(info)
}
pub(super) fn drain_utf8(pending: &mut Vec<u8>, flush: bool) -> String {
    let mut result = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(text) => {
                result.push_str(text);
                pending.clear();
                break;
            }
            Err(error) => {
                let valid = error.valid_up_to();
                result.push_str(&String::from_utf8_lossy(&pending[..valid]));
                let invalid = error.error_len();
                pending.drain(..valid);
                if let Some(length) = invalid {
                    result.push('\u{fffd}');
                    pending.drain(..length);
                } else {
                    if flush {
                        result.push_str(&String::from_utf8_lossy(pending));
                        pending.clear();
                    }
                    break;
                }
            }
        }
    }
    result
}
