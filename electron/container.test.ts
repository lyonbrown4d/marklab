import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type * as Electron from 'electron'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createElectronContainer } from '@electron/container.js'
import type { Logger } from '@electron/services/logger.js'

const logger = vi.hoisted(() => {
  const instance = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  instance.child.mockReturnValue(instance)
  return instance
})

vi.mock('@electron/services/logger.js', () => ({
  createElectronLogger: () => logger,
  noopLogger: logger,
}))

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('Electron dependency container', () => {
  it('owns one application-scoped instance for AI and local history services', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-container-'))
    roots.push(root)
    const safeStorage = createSafeStorage()
    const container = createElectronContainer(createRuntimeDependencies(root, safeStorage))

    expect(container.cradle.localHistoryService).toBe(container.cradle.localHistoryService)
    expect(container.cradle.aiProviderStore).toBe(container.cradle.aiProviderStore)
    expect(container.cradle.aiModelResolver).toBe(container.cradle.aiModelResolver)
    expect(container.cradle.aiService).toBe(container.cradle.aiService)
    expect(container.cradle.aiInlineCompletionService).toBe(
      container.cradle.aiInlineCompletionService,
    )
    expect(container.cradle.aiInlineCompletionPolicy).toBe(
      container.cradle.aiInlineCompletionPolicy,
    )
    expect(container.cradle.localAiModelManager).toBe(container.cradle.localAiModelManager)
    expect(container.cradle.localAiRuntime).toBe(container.cradle.localAiRuntime)
    expect(container.cradle.localAiService).toBe(container.cradle.localAiService)
    expect(container.cradle.languageIntelligenceService).toBe(
      container.cradle.languageIntelligenceService,
    )
    expect(safeStorage.isAsyncEncryptionAvailable).not.toHaveBeenCalled()

    await container.cradle.aiProviderStore.update({
      id: 'openai-main',
      label: 'OpenAI',
      kind: 'openai',
      model: 'gpt-5-mini',
      apiKey: 'secret',
    })

    expect(safeStorage.isAsyncEncryptionAvailable).toHaveBeenCalledOnce()
    expect(safeStorage.encryptStringAsync).toHaveBeenCalledWith('secret')
  })
})

const createRuntimeDependencies = (
  userDataPath: string,
  safeStorage: ReturnType<typeof createSafeStorage>,
) => ({
  app: {
    getPath: vi.fn(() => userDataPath),
    isPackaged: false,
  } as unknown as Electron.App,
  BrowserWindow: { fromWebContents: vi.fn() } as unknown as typeof Electron.BrowserWindow,
  clipboard: {} as Electron.Clipboard,
  dialog: {} as Electron.Dialog,
  getLaunchInfo: vi.fn(() => ({ args: [], cwd: userDataPath, deepLinks: [] })),
  ipcMain: {} as Electron.IpcMain,
  safeStorage,
  shell: {} as Electron.Shell,
})

const createSafeStorage = () => ({
  getSelectedStorageBackend: vi.fn(() => 'unknown' as const),
  isAsyncEncryptionAvailable: vi.fn(async () => true),
  encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`async:${value}`)),
  decryptStringAsync: vi.fn(async (value: Buffer) => ({
    result: value.toString('utf8').replace(/^async:/, ''),
    shouldReEncrypt: false,
  })),
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(value)),
  decryptString: vi.fn((value: Buffer) => value.toString('utf8')),
  setUsePlainTextEncryption: vi.fn(),
})

void (logger satisfies Logger)
