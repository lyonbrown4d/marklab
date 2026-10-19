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
  use std::time::{Duration, Instant};

  struct KillOnFailure(Option<Box<dyn portable_pty::ChildKiller + Send + Sync>>);
  impl Drop for KillOnFailure {
    fn drop(&mut self) {
      if let Some(killer) = self.0.as_mut() {
        let _ = killer.kill();
      }
    }
  }
  fn has_output_line(bytes: &[u8]) -> bool {
    bytes
      .split(|byte| *byte == b'\n')
      .any(|line| line.strip_suffix(b"\r").unwrap_or(line) == b"marklab-pty-ok")
  }
  #[test]
  fn real_pty_runs_shell_and_reports_exit() {
    let pair = portable_pty::native_pty_system()
      .openpty(super::size(24, 80))
      .unwrap();
    let mut reader = pair.master.try_clone_reader().unwrap();
    let mut writer = pair.master.take_writer().unwrap();
    let mut command = portable_pty::CommandBuilder::new("/bin/sh");
    // Only "ok" is written to the terminal. Its echo cannot satisfy the
    // expected line; the shell must read it and execute printf successfully.
    command.args([
      "-c",
      "IFS= read -r value; printf 'marklab-pty-%s\\n' \"$value\"; exit 7",
    ]);
    let mut child = pair.slave.spawn_command(command).unwrap();
    let mut cleanup = KillOnFailure(Some(child.clone_killer()));
    drop(pair.slave);
    let deadline = Instant::now() + Duration::from_secs(5);
    let (sender, receiver) = std::sync::mpsc::channel();
    let reader_thread = std::thread::spawn(move || {
      let mut output = Vec::new();
      let mut chunk = [0u8; 1024];
      while let Ok(count) = reader.read(&mut chunk) {
        if count == 0 {
          break;
        }
        output.extend_from_slice(&chunk[..count]);
        if has_output_line(&output) || output.len() >= 64 * 1024 {
          break;
        }
      }
      let _ = sender.send(output);
    });
    writer.write_all(b"ok\n").unwrap();
    writer.flush().unwrap();
    let output = receiver
      .recv_timeout(deadline.saturating_duration_since(Instant::now()))
      .expect("PTY did not produce an actual output line within five seconds");
    assert!(has_output_line(&output), "PTY output: {output:?}");
    let status = loop {
      if let Some(status) = child.try_wait().unwrap() {
        cleanup.0 = None;
        break status;
      }
      assert!(
        Instant::now() < deadline,
        "PTY child did not exit within five seconds"
      );
      std::thread::sleep(Duration::from_millis(10));
    };
    assert_eq!(status.exit_code(), 7);
    // Receipt means the reader has finished its blocking read loop.
    reader_thread.join().unwrap();
  }
}
