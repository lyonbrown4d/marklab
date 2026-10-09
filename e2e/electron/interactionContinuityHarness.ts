import { expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import { repoRoot, type ElectronTestSession } from './electronTestHarness.js'

const FIXTURE_PREFIX = 'marklab-interaction-continuity-'
const FIXTURE_ROOT = path.join(repoRoot, '.tmp', 'electron-fixtures')

export const createInteractionWorkspace = () => {
  fs.mkdirSync(FIXTURE_ROOT, { recursive: true })
  const root = fs.mkdtempSync(path.join(FIXTURE_ROOT, FIXTURE_PREFIX))
  fs.writeFileSync(
    path.join(root, 'Home.md'),
    '# Home\n\nHome continuity marker.\n\n[Topic](./Topic.md)\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(root, 'Topic.md'),
    '# Topic\n\nTopic continuity marker.\n\n[Home](./Home.md)\n',
    'utf8',
  )
  for (let index = 1; index <= 10; index += 1) {
    fs.writeFileSync(
      path.join(root, `Reference-${index}.md`),
      `# Reference ${index}\n\n[Home](./Home.md)\n`,
      'utf8',
    )
  }
  const longBody = Array.from(
    { length: 4_000 },
    (_, index) => `Large document interaction line ${index + 1}`,
  ).join('\n\n')
  fs.writeFileSync(path.join(root, 'Large.md'), `# Large\n\n${longBody}\n`, 'utf8')
  return root
}

export const removeInteractionWorkspace = (root: string | undefined) => {
  if (!root) return
  const resolved = path.resolve(root)
  if (
    path.dirname(resolved) !== path.resolve(FIXTURE_ROOT) ||
    !path.basename(resolved).startsWith(FIXTURE_PREFIX)
  ) {
    throw new Error(`Refusing to remove unexpected E2E workspace: ${resolved}`)
  }
  fs.rmSync(resolved, { force: true, recursive: true })
}

export const openInteractionFile = async (page: Page, name: string) => {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+P' : 'Control+P')
  const palette = page.getByRole('dialog', { name: /Command palette|命令面板/i })
  await expect(palette).toBeVisible()
  await palette.getByRole('combobox').fill(name)
  const option = palette.locator(`[data-open-new-window-path="${name}"]`).first()
  await expect(option).toBeVisible({ timeout: 30_000 })
  await option.click()
  await expect(palette).toBeHidden()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
}

export const invokeInteractionCommand = <T>(page: Page, command: string, payload?: unknown) =>
  page.evaluate(
    async ({ commandName, commandPayload }) => {
      const rendererWindow = window as Window & {
        marklabElectron?: {
          commands?: { invoke: (command: string, payload?: unknown) => Promise<unknown> }
        }
      }
      const commands = rendererWindow.marklabElectron?.commands
      if (!commands) throw new Error('Secure preload command bridge is unavailable')
      return commands.invoke(commandName, commandPayload)
    },
    { commandName: command, commandPayload: payload },
  ) as Promise<T>

export const readMapScale = (page: Page) =>
  page.locator('.react-flow__viewport').evaluate((element) => {
    const transform = getComputedStyle(element).transform
    return transform && transform !== 'none' ? new DOMMatrix(transform).a : 1
  })

export const readMapViewport = (page: Page) =>
  page.locator('.react-flow__viewport').evaluate((element) => {
    const transform = getComputedStyle(element).transform
    const matrix = transform && transform !== 'none' ? new DOMMatrix(transform) : new DOMMatrix()
    return { x: matrix.e, y: matrix.f, zoom: matrix.a }
  })

export const waitForMapScaleToSettle = (page: Page) =>
  page.locator('.react-flow__viewport').evaluate(async (element) => {
    let previous = Number.NaN
    let stableFrames = 0
    for (let frame = 0; frame < 120 && stableFrames < 3; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const transform = getComputedStyle(element).transform
      const current = transform && transform !== 'none' ? new DOMMatrix(transform).a : 1
      stableFrames = Math.abs(current - previous) < 0.000_1 ? stableFrames + 1 : 0
      previous = current
    }
    return previous
  })

export const openInteractionWorkspace = async (
  currentSession: ElectronTestSession,
  workspacePath: string,
) => {
  const root = await invokeInteractionCommand<{ kind: 'external'; path: string }>(
    currentSession.page,
    'fs_set_root',
    { path: workspacePath },
  )
  const windowHandle = await currentSession.app.browserWindow(currentSession.page)
  try {
    await windowHandle.evaluate(
      (window, state) => window.webContents.send('workspace-session-seed', { state }),
      { activeTabId: null, rootKind: root.kind, rootPath: root.path, tabs: [] },
    )
  } finally {
    await windowHandle.dispose()
  }
  await expect
    .poll(async () => {
      const snapshot = await invokeInteractionCommand<{
        entries: Array<{ path: string }>
        root: { path: string }
      }>(currentSession.page, 'fs_get_snapshot')
      return {
        hasHome: snapshot.entries.some((entry) => entry.path.endsWith('Home.md')),
        rootPath: snapshot.root.path,
      }
    })
    .toEqual({ hasHome: true, rootPath: workspacePath })
  await expect(
    currentSession.page.getByRole('button', { name: /^(Workspace|工作区):/i }),
  ).toContainText(path.basename(workspacePath))
}
