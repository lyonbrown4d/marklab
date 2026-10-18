import { browser } from '@wdio/globals'
import type { DesktopRuntimeApi, DesktopCommandArguments } from '@/runtime/desktop'

export const applicationIdentifier = () =>
  browser.executeAsync((done) => {
    const host = window as unknown as {
      __TAURI_INTERNALS__?: { invoke: (command: string) => Promise<string> }
    }
    if (!host.__TAURI_INTERNALS__) return done(null)
    host.__TAURI_INTERNALS__.invoke('plugin:app|identifier').then(
      (value) => done(value),
      () => done(null),
    )
  })

export const currentRoot = () =>
  browser.executeAsync((done) => {
    const runtime: DesktopRuntimeApi | undefined = window.marklabTauri
    if (!runtime) return done(null)
    runtime.commands.invoke<{ kind: string; path: string }>('fs_get_root_info').then(
      (root) => done(root.path),
      () => done(null),
    )
  })

export const switchToWorkspace = async (root: string) => {
  await browser.waitUntil(
    async () => {
      for (const handle of await browser.getWindowHandles()) {
        try {
          await browser.switchToWindow(handle)
          if ((await currentRoot()) === root) {
            return true
          }
        } catch {
          /* A splash or closing owner may disappear while handles are enumerated. */
        }
      }
      return false
    },
    {
      timeout: 90_000,
      timeoutMsg: 'Native workspace did not complete its real renderer handshake',
    },
  )
  if ((await applicationIdentifier()) !== 'app.marklab.tauri.desktop.e2e')
    throw new Error('Refusing to operate on a non-E2E application')
}

export const openEditor = async (file = 'Editor.md') => {
  const root = await currentRoot()
  if (typeof root !== 'string') throw new Error('No native workspace is bound')
  await browser.$('[data-app-focus-zone="titlebar"]').waitForDisplayed({ timeout: 30_000 })
  const pinned = await browser
    .$('[data-app-focus-zone="editor"]')
    .getAttribute('data-sidebar-pinned')
  if (pinned !== 'true') {
    await browser.$('[data-app-focus-zone="titlebar"] button:has(svg.lucide-panel-left)').click()
  }
  // Reopening a window can remount the file tree. Do not keep an element handle
  // from before the drawer transition: the embedded driver can retain detached DOM.
  await browser.waitUntil(
    async () => (await browser.$(`button[data-file-tree-node]=${file}`)).isDisplayed(),
    { timeout: 30_000, timeoutMsg: `The live file tree never displayed ${file}` },
  )
  await browser.$(`button[data-file-tree-node]=${file}`).click()
  await browser
    .$('[data-testid="markdown-editor"][data-state="ready"]')
    .waitForDisplayed({ timeout: 90_000 })
  await browser.waitUntil(
    () =>
      browser.executeAsync((done) => {
        const host = window as unknown as {
          __TAURI_INTERNALS__: {
            metadata: { currentWindow: { label: string } }
            invoke: (command: string, payload: { label: string }) => Promise<boolean>
          }
        }
        const internals = host.__TAURI_INTERNALS__
        internals.invoke('plugin:window|is_visible', internals.metadata.currentWindow).then(
          (visible) =>
            done(
              visible &&
                document.visibilityState === 'visible' &&
                !document.querySelector('.window-presentation-pending'),
            ),
          () => done(false),
        )
      }),
    {
      timeout: 30_000,
      timeoutMsg: 'Native workspace was rendered but never presented for editing',
    },
  )
}

export const waitForRustMarker = async (marker: string, path = 'Editor.md') => {
  await browser.waitUntil(
    async () => {
      const snapshot = await invokeNative<{ content: string }>('fs_open_buffer_snapshot', {
        path,
      })
      return snapshot.content.includes(marker)
    },
    { timeout: 20_000, timeoutMsg: 'Plate edit did not reach the actual Rust buffer' },
  )
}

export const typeAtEditorEnd = async (text: string) => {
  const editor = await browser.$('[data-testid="markdown-editor"]')
  await editor.click()
  // The embedded driver's click focuses the element without placing a caret.
  // Position selection only; send-keys must still enter through the real editor.
  let stable = 0
  await browser.waitUntil(
    async () => {
      const atEnd = await browser.execute((element) => {
        const leaves = element.querySelectorAll('[data-slate-string]')
        const last = leaves.item(leaves.length - 1)
        if (!last) throw new Error('Plate has no text leaf for native input')
        const selection = window.getSelection()
        if (!selection) throw new Error('Native WebView selection is unavailable')
        if (
          document.activeElement === element &&
          selection.isCollapsed &&
          selection.anchorNode &&
          last.contains(selection.anchorNode)
        ) {
          const prefix = document.createRange()
          prefix.selectNodeContents(last)
          prefix.setEnd(selection.anchorNode, selection.anchorOffset)
          if (prefix.toString() === last.textContent) return true
        }
        element.focus()
        const range = document.createRange()
        range.selectNodeContents(last)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
        return false
      }, editor)
      stable = atEnd ? stable + 1 : 0
      return stable >= 3
    },
    {
      interval: 100,
      timeout: 5_000,
      timeoutMsg: 'The real editor caret never stabilized at the document end',
    },
  )
  await editor.addValue(text)
  await browser.waitUntil(
    () =>
      browser.execute(
        (element, expected) => {
          const leaves = element.querySelectorAll('[data-slate-string]')
          return Array.from(leaves, (leaf) => leaf.textContent ?? '')
            .join('')
            .endsWith(expected)
        },
        editor,
        text,
      ),
    {
      timeoutMsg: 'WebDriver text input did not reach the Plate DOM',
    },
  )
}

export const invokeNative = <T>(command: string, payload?: DesktopCommandArguments): Promise<T> =>
  browser
    .executeAsync(
      (name, request, done) => {
        const runtime: DesktopRuntimeApi | undefined = window.marklabTauri
        if (!runtime) return done({ ok: false, error: 'Real Tauri runtime was not initialized' })
        runtime.commands.invoke(name, request).then(
          (value) => done({ ok: true, value }),
          () => done({ ok: false, error: `Native command failed: ${name}` }),
        )
      },
      command,
      payload,
    )
    .then((result) => {
      const response = result as { ok: boolean; value?: T; error?: string }
      if (!response.ok) throw new Error(response.error)
      return response.value as T
    })

type CloseAcknowledgment = { scheduled: true } | { scheduled: false; error: string }

export const closeThroughApplication = async (marker: string) => {
  const acknowledgment = await browser.executeAsync<CloseAcknowledgment, [string]>(
    (expectedMarker, done) => {
      const runtime: DesktopRuntimeApi | undefined = window.marklabTauri
      if (!runtime) return done({ scheduled: false, error: 'Real Tauri runtime is unavailable' })
      runtime.commands
        .invoke<{ content: string }>('fs_open_buffer_snapshot', {
          path: 'Editor.md',
        })
        .then(
          (snapshot) => {
            if (!snapshot.content.includes(expectedMarker)) {
              return done({
                scheduled: false,
                error: 'Close must begin after the actual Rust buffer receives the edit',
              })
            }
            // Autosave can settle during a WebDriver round trip, so dirty is not
            // a stable E2E precondition. Never manually flush before this close.
            // The driver close endpoint destroys the window directly. Acknowledge this
            // script first, then run the application's editor/native flush handshake.
            done({ scheduled: true })
            window.setTimeout(() => {
              void runtime.window
                .close()
                .catch((error: unknown) => console.error('Production window close failed', error))
            }, 0)
          },
          () => done({ scheduled: false, error: 'Cannot inspect the pending native edit' }),
        )
    },
    marker,
  )
  if (!acknowledgment.scheduled) throw new Error(acknowledgment.error)
}
