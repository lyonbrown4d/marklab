use super::*;
use std::{io::Read, os::fd::AsRawFd};
use x11rb::{
  CURRENT_TIME,
  protocol::{
    Event,
    xproto::{Allow, ChangeWindowAttributesAux, EventMask, GrabMode, ModMask},
  },
};

// Thread entry transfers ownership of the tab, bindings and channel endpoints.
#[allow(clippy::too_many_arguments)]
pub(super) fn run(
  xid: u32,
  manager: WebTabs,
  window: TrustedWindow,
  id: String,
  initial: Vec<shortcuts::Shortcut>,
  mut wake: UnixStream,
  updates: mpsc::Receiver<Update>,
  ready: tokio::sync::oneshot::Sender<BackendResult<()>>,
) -> BackendResult<()> {
  let initialized = || -> BackendResult<_> {
    let (conn, _) =
      x11rb::connect(None).map_err(|_| failure("Cannot connect native shortcut display"))?;
    // Observe teardown of this CEF child only; masks are maintained per X11 connection.
    conn
      .change_window_attributes(
        xid,
        &ChangeWindowAttributesAux::new().event_mask(EventMask::STRUCTURE_NOTIFY),
      )
      .map_err(|_| failure("Cannot observe native shortcut window"))?
      .check()
      .map_err(|_| failure("Native shortcut window is unavailable"))?;
    let mut grabs = Vec::new();
    replace_grabs(&conn, xid, &mut grabs, &initial)?;
    Ok((conn, grabs))
  }();
  let (conn, mut grabs) = match initialized {
    Ok(value) => value,
    Err(error) => {
      let _ = ready.send(Err(error));
      return Ok(());
    }
  };
  if ready.send(Ok(())).is_err() {
    return Ok(());
  }
  loop {
    while let Some(event) = conn
      .poll_for_event()
      .map_err(|_| failure("Native shortcut display disconnected"))?
    {
      match event {
        Event::KeyPress(event) if event.response_type & 0x80 == 0 => {
          let mask = ModMask::from(u16::from(event.state) & 0xff);
          let accepted = grabs
            .iter()
            .find(|grab| grab.code == event.detail && grab.mask == mask)
            .is_some_and(|grab| {
              owns_focus(&conn, xid).unwrap_or(false)
                && manager.shortcut(&window, &id, &grab.binding.key, grab.binding.modifiers)
            });
          if accepted {
            // Release immediately so normal keys typed while the shortcut is held keep reaching CEF.
            conn
              .ungrab_keyboard(CURRENT_TIME)
              .map_err(|_| failure("Cannot release native shortcut grab"))?;
          } else {
            conn
              .allow_events(Allow::REPLAY_KEYBOARD, event.time)
              .map_err(|_| failure("Cannot replay native shortcut event"))?;
          }
          conn
            .flush()
            .map_err(|_| failure("Cannot complete native shortcut event"))?;
        }
        Event::DestroyNotify(event) if event.window == xid => return Ok(()),
        Event::MappingNotify(_) => {
          // Refresh only this tab's configured shortcuts after an OS keyboard-layout change.
          replace_grabs(&conn, xid, &mut grabs, &bindings(&manager, window.label())?)?;
        }
        _ => (),
      }
    }
    loop {
      match updates.try_recv() {
        Ok(update) => {
          let _ = update
            .reply
            .send(replace_grabs(&conn, xid, &mut grabs, &update.bindings));
        }
        Err(mpsc::TryRecvError::Empty) => break,
        Err(mpsc::TryRecvError::Disconnected) => return Ok(()),
      }
    }
    let mut descriptors = [
      libc::pollfd {
        fd: conn.stream().as_raw_fd(),
        events: libc::POLLIN,
        revents: 0,
      },
      libc::pollfd {
        fd: wake.as_raw_fd(),
        events: libc::POLLIN,
        revents: 0,
      },
    ];
    // A single blocking wait per tab; no timer, global input subscription, or idle polling.
    let status = unsafe {
      libc::poll(
        descriptors.as_mut_ptr(),
        descriptors.len() as libc::nfds_t,
        -1,
      )
    };
    if status < 0 {
      if std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted {
        continue;
      }
      return Err(failure("Native shortcut wait failed"));
    }
    if descriptors[1].revents != 0 {
      let mut buffer = [0; 128];
      loop {
        match wake.read(&mut buffer) {
          Ok(0) => return Ok(()),
          Ok(_) => (),
          Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => break,
          Err(_) => return Err(failure("Native shortcut wake channel disconnected")),
        }
      }
    }
    if descriptors[0].revents & (libc::POLLERR | libc::POLLHUP | libc::POLLNVAL) != 0 {
      return Err(failure("Native shortcut display disconnected"));
    }
  }
}

fn replace_grabs(
  conn: &RustConnection,
  xid: u32,
  current: &mut Vec<keys::Grab>,
  bindings: &[shortcuts::Shortcut],
) -> BackendResult<()> {
  let next = keys::compile(conn, bindings)?;
  let mut added: Vec<&keys::Grab> = Vec::new();
  for grab in next
    .iter()
    .filter(|grab| !current.iter().any(|existing| existing.same_key(grab)))
  {
    let result = conn
      .grab_key(
        false,
        xid,
        grab.mask,
        grab.code,
        GrabMode::ASYNC,
        GrabMode::SYNC,
      )
      .map_err(|_| failure("Cannot register native web tab shortcut"))?
      .check();
    if result.is_err() {
      for grab in added {
        let _ = conn.ungrab_key(grab.code, xid, grab.mask);
      }
      let _ = conn.flush();
      return Err(failure(
        "Native web tab shortcut conflicts with another application grab",
      ));
    }
    added.push(grab);
  }
  for grab in current
    .iter()
    .filter(|grab| !next.iter().any(|next| next.same_key(grab)))
  {
    conn
      .ungrab_key(grab.code, xid, grab.mask)
      .map_err(|_| failure("Cannot release replaced native shortcut"))?
      .check()
      .map_err(|_| failure("Cannot release replaced native shortcut"))?;
  }
  conn
    .flush()
    .map_err(|_| failure("Cannot apply native web tab shortcuts"))?;
  *current = next;
  Ok(())
}
