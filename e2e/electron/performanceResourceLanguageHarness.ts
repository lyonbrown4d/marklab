import { expect, type Page, type TestInfo } from '@playwright/test'
import type * as Monaco from '@/lib/monacoRuntime'

export const assertMonacoLanguageWorkers = async (page: Page) => {
  const results = await page.evaluate(async () => {
    const monaco = (window as Window & { monaco?: typeof Monaco }).monaco
    if (!monaco) throw new Error('The production Monaco API is unavailable')
    const jsonModel = monaco.editor.createModel(
      '{ "value": 7 }',
      'json',
      monaco.Uri.parse('inmemory://lifecycle/first.json'),
    )
    const tsModel = monaco.editor.createModel(
      'const value: number = "wrong";',
      'typescript',
      monaco.Uri.parse('inmemory://lifecycle/first.ts'),
    )
    const host = document.createElement('div')
    Object.assign(host.style, { position: 'fixed', inset: '100px', zIndex: '9999' })
    document.body.append(host)
    const editor = monaco.editor.create(host, { model: jsonModel })
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      const jsonWorker = await (await monaco.json.getWorker())(jsonModel.uri)
      const parsed = await jsonWorker.parseJSONDocument(jsonModel.uri.toString())
      editor.setModel(tsModel)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const tsWorker = await (await monaco.typescript.getTypeScriptWorker())(tsModel.uri)
      const errors = await tsWorker.getSemanticDiagnostics(tsModel.uri.toString())
      return { jsonRoot: parsed?.root?.type, tsErrors: errors.map((error) => error.code) }
    } finally {
      editor.dispose()
      host.remove()
      jsonModel.dispose()
      tsModel.dispose()
    }
  })
  expect(results.jsonRoot).toBe('object')
  expect(results.tsErrors).toContain(2322)

  for (const language of ['css', 'html'] as const) {
    await page.evaluate(async (languageId) => {
      const monaco = (window as Window & { monaco?: typeof Monaco }).monaco!
      const host = document.createElement('div')
      Object.assign(host.style, { position: 'fixed', inset: '100px', zIndex: '9999' })
      document.body.append(host)
      const model = monaco.editor.createModel(
        languageId === 'css' ? 'body { col' : '<di',
        languageId,
        monaco.Uri.parse(`inmemory://lifecycle/first.${languageId}`),
      )
      const editor = monaco.editor.create(host, { model, minimap: { enabled: false } })
      try {
        editor.setPosition(model.getPositionAt(model.getValueLength()))
        editor.focus()
        await editor.getAction('editor.action.triggerSuggest')?.run()
        await new Promise<void>((resolve, reject) => {
          const startedAt = Date.now()
          const check = () => {
            const widget = editor.getDomNode()?.querySelector('.suggest-widget.visible')
            if (widget?.querySelector('.monaco-list-row')) return resolve()
            if (Date.now() - startedAt > 15_000)
              return reject(new Error(`${languageId} language completions did not appear`))
            setTimeout(check, 50)
          }
          check()
        })
      } finally {
        editor.dispose()
        model.dispose()
        host.remove()
      }
    }, language)
  }
  for (const workerName of ['json', 'ts', 'css', 'html']) {
    await expect
      .poll(
        () =>
          page
            .workers()
            .some((worker) => new RegExp(`/${workerName}\\.worker[-.]`).test(worker.url())),
        { timeout: 10_000 },
      )
      .toBe(true)
  }
}

export const attachSourceState = async (page: Page, info: TestInfo, name: string) => {
  const state = await page.evaluate(() => {
    const monaco = (window as Window & { monaco?: typeof Monaco }).monaco!
    return {
      url: location.href,
      active: document.activeElement?.className,
      tabs: [...document.querySelectorAll('[role="tab"]')].map((tab) =>
        tab.getAttribute('aria-label'),
      ),
      models: monaco.editor.getModels().map((model) => ({
        uri: model.uri.toString(),
        version: model.getVersionId(),
        canUndo: model.canUndo(),
        text: model.getValue().slice(-80),
      })),
      editors: monaco.editor.getEditors().map((editor) => ({
        uri: editor.getModel()?.uri.toString(),
        focus: editor.hasTextFocus(),
      })),
    }
  })
  await info.attach(name + '.json', {
    body: JSON.stringify(state, null, 2),
    contentType: 'application/json',
  })
}
