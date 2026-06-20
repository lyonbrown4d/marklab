import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const electronMain = path.join(repoRoot, 'dist-electron', 'main.js')
const rendererDistRoot = path.join(repoRoot, 'dist')
const e2eOutputRoot = path.join(repoRoot, '.tmp', 'electron-e2e')

let rendererUrl = ''

type RendererWindow = Window & {
  ipcRenderer?: unknown
  marklabElectron?: unknown
  require?: unknown
}

const isMainRendererUrl = (url: string) => url.startsWith(rendererUrl)

const contentTypeByExtension = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.wasm', 'application/wasm'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

const resolveDistFile = (requestUrl: string | undefined) => {
  const parsedUrl = new URL(requestUrl ?? '/', 'http://127.0.0.1')
  const pathname = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname
  const filePath = path.normalize(path.join(rendererDistRoot, decodeURIComponent(pathname)))
  const relativePath = path.relative(rendererDistRoot, filePath)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null
  return filePath
}

const startRendererServer = () => {
  return new Promise<http.Server>((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const filePath = resolveDistFile(request.url)

      if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        response.writeHead(404)
        response.end('Not found')
        return
      }

      response.writeHead(200, {
        'Content-Type':
          contentTypeByExtension.get(path.extname(filePath)) ?? 'application/octet-stream',
      })
      fs.createReadStream(filePath).pipe(response)
    })

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server)
    })
  })
}

const pickProcessEnv = (keys: string[]) => {
  return keys.reduce<Record<string, string>>((env, key) => {
    const value = process.env[key]
    if (value) env[key] = value
    return env
  }, {})
}

const attachElectronOutput = (app: ElectronApplication, output: string[]) => {
  const process = app.process()
  const collect = (chunk: Buffer) => {
    output.push(chunk.toString('utf8').trim())
  }

  process.stdout?.on('data', collect)
  process.stderr?.on('data', collect)
}

const waitForMainWindow = async (app: ElectronApplication, output: string[]) => {
  const startedAt = Date.now()
  const observedUrls = new Set<string>()

  while (Date.now() - startedAt < 30_000) {
    const mainWindow = app.windows().find((candidate) => {
      const url = candidate.url()
      if (url) observedUrls.add(url)
      return isMainRendererUrl(url)
    })

    if (mainWindow) {
      return mainWindow
    }

    await app.waitForEvent('window', { timeout: 1_000 }).catch(() => undefined)
  }

  throw new Error(
    `Timed out waiting for the Electron main window. Observed URLs: ${
      [...observedUrls].join(', ') || '(none)'
    }. Electron output: ${output.join('\n') || '(none)'}`,
  )
}

test.describe('Electron desktop shell', () => {
  let app: ElectronApplication | undefined
  let electronOutput: string[] = []
  let page: Page
  let server: http.Server | undefined
  let testRunRoot: string | undefined

  test.beforeAll(async () => {
    server = await startRendererServer()
    const address = server.address()

    if (!address || typeof address === 'string') {
      throw new Error('Unable to determine renderer server address')
    }

    rendererUrl = `http://127.0.0.1:${address.port}`
  })

  test.afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve()
        return
      }

      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  })

  test.beforeEach(async () => {
    testRunRoot = path.join(e2eOutputRoot, `${Date.now()}-${process.pid}`)
    const appData = path.join(testRunRoot, 'appdata')
    const localAppData = path.join(testRunRoot, 'localappdata')
    const userData = path.join(testRunRoot, 'user-data')

    fs.mkdirSync(testRunRoot, { recursive: true })

    app = await electron.launch({
      args: [
        '--disable-dev-shm-usage',
        '--disable-features=VizDisplayCompositor',
        '--disable-gpu',
        '--disable-gpu-compositing',
        '--disable-gpu-sandbox',
        '--no-sandbox',
        '--use-angle=swiftshader',
        `--user-data-dir=${userData}`,
        electronMain,
      ],
      cwd: repoRoot,
      env: {
        ...pickProcessEnv(['COMSPEC', 'Path', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'WINDIR']),
        APPDATA: appData,
        ELECTRON_ENABLE_LOGGING: '1',
        HOME: testRunRoot,
        LOCALAPPDATA: localAppData,
        MARKLAB_E2E: '1',
        USERPROFILE: testRunRoot,
        VITE_DEV_SERVER_URL: rendererUrl,
      },
    })

    attachElectronOutput(app, electronOutput)
    page = await waitForMainWindow(app, electronOutput)
  })

  test.afterEach(async () => {
    await app?.close().catch(() => undefined)

    if (testRunRoot) {
      fs.rmSync(testRunRoot, { recursive: true, force: true })
    }

    app = undefined
    electronOutput = []
    testRunRoot = undefined
  })

  test('loads the renderer through a narrow secure preload bridge', async () => {
    await expect(page).toHaveTitle(/marklab/i)

    const bridge = await page.evaluate(() => {
      const rendererWindow = window as RendererWindow

      return {
        hasGenericIpc: typeof rendererWindow.ipcRenderer !== 'undefined',
        hasMarklabElectronBridge: typeof rendererWindow.marklabElectron === 'object',
        hasNodeRequire: typeof rendererWindow.require === 'function',
      }
    })

    expect(bridge).toEqual({
      hasGenericIpc: false,
      hasMarklabElectronBridge: true,
      hasNodeRequire: false,
    })
  })
})
