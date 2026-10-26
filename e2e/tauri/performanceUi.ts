/* eslint-disable no-restricted-imports -- Browser-serialized native benchmark only. */
import type { collectFrameProbe } from '../performance/frameProbe.js'
/* eslint-enable no-restricted-imports */

type Plan = {
  documents: Array<{ path: string; route: string; heading: string }>
  markdown: string[]
  workbooks: Array<{ path: string; route: string; name: string }>
  warmupRuns: number
  measuredRuns: number
}

// One driver invocation retains the real root while native preview children attach.
export const nativePerformanceScenario = async (
  plan: Plan,
  installFrames: () => void,
  collectFrames: typeof collectFrameProbe,
) => {
  const runtime = window.marklabTauri
  if (!runtime) throw new Error('The real desktop runtime is unavailable')
  const wait = async (condition: () => boolean | Promise<boolean>, message: string) => {
    const deadline = Date.now() + 30_000
    while (!(await condition())) {
      if (Date.now() >= deadline) throw new Error(message)
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }
  const timed = async <T>(run: () => Promise<T>) => {
    const started = performance.now()
    const result = await run()
    return { ms: performance.now() - started, result }
  }
  const editor = () =>
    document.querySelector<HTMLElement>('[data-testid="markdown-editor"][data-state="ready"]')
  const openDocument = async (item: Plan['documents'][number]) => {
    window.location.hash = item.route
    await wait(() => {
      const surface = editor()
      return (
        surface
          ?.closest('[data-editor-document-path]')
          ?.getAttribute('data-editor-document-path') === item.path &&
        surface
          .closest('[data-editor-transition-phase]')
          ?.getAttribute('data-editor-transition-phase') === 'idle' &&
        (!item.heading || surface.textContent?.includes(item.heading) === true)
      )
    }, `Document did not finish opening: ${item.path}`)
  }
  const firstReady = Date.now()
  const samples = []
  for (let run = 0; run < plan.warmupRuns + plan.measuredRuns; run++) {
    const started = Date.now()
    const bufferReads = []
    for (const path of plan.markdown) {
      const read = await timed(() => runtime.commands.invoke('fs_open_buffer_snapshot', { path }))
      if (typeof read.result.content !== 'string') throw new Error(`Buffer unavailable: ${path}`)
      bufferReads.push(read.ms)
    }
    const search = await timed(() =>
      runtime.commands.invoke('fs_search_workspace', { query: '规则', limit: 100 }),
    )
    if (!search.result.length) throw new Error('The real workspace search returned no matches')
    const graph = await timed(() => runtime.commands.invoke('fs_get_workspace_graph'))
    if (graph.result.nodes.length < plan.markdown.length)
      throw new Error('The workspace graph omitted documents')
    const documentOpens = []
    for (const item of plan.documents) {
      const opened = await timed(() => openDocument(item))
      documentOpens.push({ path: item.path, ms: opened.ms })
    }
    const longest = plan.documents[0]!
    await openDocument(longest)
    installFrames()
    let frames: ReturnType<typeof collectFrameProbe>
    try {
      const viewport = editor()!
      if (viewport.scrollHeight <= viewport.clientHeight)
        throw new Error('The editor has no scrollable range')
      for (let step = 0; step < 24; step++) {
        viewport.scrollTop = step % 2 ? 0 : viewport.scrollHeight
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        if (step % 2 === 0 && viewport.scrollTop <= 0) throw new Error('The editor did not scroll')
      }
    } finally {
      frames = collectFrames()
    }
    const marker = ` native-performance-${run}`
    const edit = await timed(async () => {
      const surface = editor()!
      const leaves = surface.querySelectorAll('[data-slate-string]')
      const last = leaves.item(leaves.length - 1)
      if (!last) throw new Error('No editable text leaf')
      surface.focus()
      const range = document.createRange()
      range.selectNodeContents(last)
      range.collapse(false)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
      // WebKit's editing command is also used by the SDK's send-keys.
      // No Slate content/history API or IPC mock is involved.
      document.execCommand('insertText', false, marker)
      await wait(
        async () =>
          (
            await runtime.commands.invoke('fs_open_buffer_snapshot', { path: longest.path })
          ).content.includes(marker),
        'Input did not reach the real Rust buffer',
      )
      await runtime.commands.invoke('fs_flush_buffers')
    })
    // Keep edits in this disposable copy. Undo/redo has its own native memory
    // journey; resetting history here would change the measured workload.
    const graphUi = await timed(async () => {
      const open = document.querySelector<HTMLButtonElement>(
        '[data-app-focus-zone="titlebar"] button:has(svg.lucide-network)',
      )
      if (!open) throw new Error('Graph control is unavailable')
      open.click()
      await wait(() => document.querySelector('.react-flow') !== null, 'Graph did not render')
      document
        .querySelector<HTMLButtonElement>(
          '[data-app-focus-zone="titlebar"] button:has(svg.lucide-files)',
        )!
        .click()
      await openDocument(longest)
    })
    const spreadsheetPreview = await timed(async () => {
      const workbook = plan.workbooks[0]
      if (!workbook) return
      window.location.hash = workbook.route
      await wait(
        () =>
          document
            .querySelector('[role="grid"]')
            ?.getAttribute('aria-label')
            ?.startsWith(workbook.name) === true,
        'The real workbook grid did not load',
      )
      await openDocument(longest)
    })
    const spreadsheets = []
    const recalculation = []
    for (const workbook of plan.workbooks) {
      const first = await timed(() =>
        runtime.commands.invoke('spreadsheet_read_page', {
          path: workbook.path,
          limit: 100,
          recalculate: false,
        }),
      )
      if (!first.result.sheets.length) throw new Error(`No worksheets: ${workbook.path}`)
      spreadsheets.push({
        path: workbook.path,
        sheet: first.result.sheet,
        ms: first.ms,
        rows: first.result.totalRows,
        calculation: first.result.calculation,
      })
      for (const sheet of first.result.sheets.filter((sheet) => sheet !== first.result.sheet)) {
        const page = await timed(() =>
          runtime.commands.invoke('spreadsheet_read_page', {
            path: workbook.path,
            sheet,
            limit: 100,
            recalculate: false,
          }),
        )
        spreadsheets.push({
          path: workbook.path,
          sheet,
          ms: page.ms,
          rows: page.result.totalRows,
          calculation: page.result.calculation,
        })
      }
      const started = performance.now()
      try {
        const calculated = await runtime.commands.invoke('spreadsheet_read_page', {
          path: workbook.path,
          limit: 100,
          recalculate: true,
        })
        recalculation.push({
          path: workbook.path,
          supported: true,
          ms: performance.now() - started,
          calculation: calculated.calculation,
        })
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          !['SPREADSHEET_CALCULATION_UNSUPPORTED', 'SPREADSHEET_CALCULATION_LIMIT'].includes(
            String(error.code),
          )
        )
          throw error
        recalculation.push({
          path: workbook.path,
          supported: false,
          ms: performance.now() - started,
          code: String(error.code),
          message: error.message,
        })
      }
    }
    samples.push({
      run,
      started,
      ended: Date.now(),
      warmup: run < plan.warmupRuns,
      bufferReads,
      searchMs: search.ms,
      graphMs: graph.ms,
      graphUiMs: graphUi.ms,
      documentOpens,
      frames,
      editToRustFlushAcknowledgmentMs: edit.ms,
      spreadsheetPreviewRoundTripMs: spreadsheetPreview.ms,
      spreadsheets,
      recalculation,
    })
  }
  return {
    firstReady,
    samples,
    webview: { userAgent: navigator.userAgent, scale: devicePixelRatio },
  }
}
