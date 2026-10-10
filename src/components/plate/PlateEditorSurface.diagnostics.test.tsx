import { render, screen, waitFor } from '@testing-library/react'
import { DiagnosticSeverity } from 'vscode-languageserver-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlateEditorSurface } from '@/components/plate/PlateEditorSurface'
import { plateDiagnosticsStore } from '@/components/plate/plateDiagnosticsStore'

const languageApi = vi.hoisted(() => ({
  openDocument: vi.fn(),
  changeDocument: vi.fn(),
  closeDocument: vi.fn(),
  completion: vi.fn(),
  diagnostics: vi.fn(),
}))

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/languageIntelligenceApi', () => ({ languageIntelligenceApi: languageApi }))

describe('PlateEditorSurface diagnostics', () => {
  beforeEach(() => {
    languageApi.openDocument.mockResolvedValue({ ok: true, version: 1 })
    languageApi.changeDocument.mockResolvedValue({ ok: true, version: 2 })
    languageApi.closeDocument.mockResolvedValue({ ok: true })
    languageApi.diagnostics.mockResolvedValue([
      {
        message: 'Cannot find linked file "missing.md"',
        range: { start: { line: 0, character: 14 }, end: { line: 0, character: 24 } },
        severity: DiagnosticSeverity.Error,
        source: 'markdown',
      },
    ])
  })

  afterEach(() => plateDiagnosticsStore.setState({ current: null }))

  it('decorates the visible link text and publishes current diagnostics', async () => {
    const view = render(
      <PlateEditorSurface
        activePath="notes/current.md"
        onChange={vi.fn()}
        placeholder="Write"
        value="See [Missing](missing.md)"
        workspaceKey="external:/notes"
      />,
    )

    const decorated = await waitFor(() => {
      const element = document.querySelector('[data-diagnostic-severity="error"]')
      expect(element).toBeInTheDocument()
      return element
    })
    expect(decorated).toHaveTextContent('Missing')
    expect(decorated).toHaveAttribute('aria-invalid', 'true')
    expect(plateDiagnosticsStore.getState().current).toMatchObject({
      path: 'notes/current.md',
      workspaceKey: 'external:/notes',
      diagnostics: [expect.objectContaining({ line: 1, startColumn: 15, severity: 'error' })],
    })

    view.unmount()
    await waitFor(() => expect(languageApi.closeDocument).toHaveBeenCalled())
  })

  it('keeps the editor undecorated when diagnostics resolve empty', async () => {
    languageApi.diagnostics.mockResolvedValue([])
    render(
      <PlateEditorSurface
        activePath="notes/clean.md"
        onChange={vi.fn()}
        placeholder="Write"
        value="Clean paragraph"
        workspaceKey="external:/notes"
      />,
    )

    await waitFor(() => expect(languageApi.diagnostics).toHaveBeenCalled())
    expect(screen.getByText('Clean paragraph')).not.toHaveAttribute('data-diagnostic-severity')
  })

  it('does not replace indexed diagnostics when live analysis fails', async () => {
    const error = new Error('Diagnostics unavailable')
    languageApi.diagnostics.mockRejectedValue(error)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <PlateEditorSurface
        activePath="notes/failing.md"
        onChange={vi.fn()}
        placeholder="Write"
        value="[Missing](missing.md)"
        workspaceKey="external:/notes"
      />,
    )

    await waitFor(() =>
      expect(console.error).toHaveBeenCalledWith('Rich editor diagnostics failed', error),
    )
    expect(plateDiagnosticsStore.getState().current).toBeNull()
  })
})
