import type { Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

type Payload = Record<string, unknown>
let script: Promise<string> | undefined
const fixtureScript = (): Promise<string> => {
  script ??= (async () => {
    const result = await build({
      configFile: false,
      root: path.resolve(import.meta.dirname, '../..'),
      publicDir: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        lib: {
          entry: fileURLToPath(new URL('./nativeFixture.browser.ts', import.meta.url)),
          formats: ['iife'],
          name: 'MarklabRendererFixture',
        },
      },
    })
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((output) =>
      'output' in output ? output.output : [],
    )
    const chunk = outputs.find((output) => output.type === 'chunk')
    if (!chunk || chunk.type !== 'chunk')
      throw new Error('Test-only SDK fixture did not produce an in-memory script')
    return chunk.code
  })()
  return script
}

export const installNativeFixture = async (
  page: Page,
  invoke: (command: string, args: Payload) => Promise<unknown>,
) => {
  const content = await fixtureScript()
  await page.exposeFunction('__marklabRendererFixtureInvoke', invoke)
  // One synchronous IIFE runs before any application module. No production
  // resource, dynamic import race, or native automation capability is added.
  await page.addInitScript({ content })
}

export const publishFixtureEvent = (page: Page, event: string, payload: unknown) =>
  page.evaluate(
    async ({ event, payload }) => {
      const host = window as unknown as {
        __marklabRendererFixture: { emit: (event: string, payload: unknown) => Promise<void> }
      }
      await host.__marklabRendererFixture.emit(event, payload)
    },
    { event, payload },
  )
