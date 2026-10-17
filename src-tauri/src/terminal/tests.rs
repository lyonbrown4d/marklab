use super::*;
#[test]
fn output_preserves_split_unicode() {
    let mut pending = vec![0xe4, 0xb8];
    assert_eq!(super::drain_utf8(&mut pending, false), "");
    pending.push(0xad);
    assert_eq!(super::drain_utf8(&mut pending, false), "中");
}
#[test]
fn clamps_dimensions() {
    let size = super::size(0, 10000);
    assert_eq!((size.rows, size.cols), (8, 400));
}
#[test]
fn workspace_reopen_invalidates_pending_creation() {
    let state = super::TerminalState::default();
    let before = state.epoch("window").unwrap();
    state.close_window("window");
    assert!(state.epoch("window").is_err());
    state.reopen_window("window").unwrap();
    let after = state.epoch("window").unwrap();
    assert_ne!(before, after);
    assert!(state.epoch("another").is_ok());
    state.close_window("window");
    state.reopen_window("window").unwrap();
    assert_ne!(after, state.epoch("window").unwrap());
}
#[test]
fn disposed_terminal_cannot_reopen() {
    let state = super::TerminalState::default();
    state.dispose();
    assert!(state.reopen_window("window").is_err());
    assert!(state.epoch("window").is_err());
}
#[test]
fn session_owner_is_enforced() {
    assert!(
        super::TerminalState::default()
            .session("missing", "other")
            .is_err()
    );
}
#[cfg(all(test, unix))]
mod pty_tests {
    use std::io::{Read, Write};
    #[test]
    fn real_pty_runs_shell_and_reports_exit() {
        let pair = portable_pty::native_pty_system()
            .openpty(super::size(24, 80))
            .unwrap();
        let command = portable_pty::CommandBuilder::new("/bin/sh");
        let mut child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        let (sender, receiver) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            let mut output = Vec::new();
            let mut chunk = [0u8; 1024];
            while let Ok(count) = reader.read(&mut chunk) {
                if count == 0 {
                    break;
                }
                output.extend_from_slice(&chunk[..count]);
                if String::from_utf8_lossy(&output).contains("marklab-pty-ok") {
                    let _ = sender.send(output);
                    return;
                }
            }
        });
        writer
            .write_all(b"printf 'marklab-pty-ok\\n'; exit 7\n")
            .unwrap();
        writer.flush().unwrap();
        let output = receiver.recv_timeout(std::time::Duration::from_secs(5));
        if output.is_err() {
            let _ = child.kill();
        }
        assert!(output.is_ok());
        let status = child.wait().unwrap();
        assert_eq!(status.exit_code(), 7);
        let _ = thread.join();
    }
}
