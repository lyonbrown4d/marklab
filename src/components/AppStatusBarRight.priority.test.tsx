import { fireEvent, render, screen } from '@testing-library/react'
import { parse } from 'postcss'
import { compile } from 'tailwindcss'
import { describe, expect, it, vi } from 'vitest'
import { AppStatusBarRight } from '@/components/AppStatusBarRight'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/StatusCenter', () => ({
  default: () => <button type="button">Task center</button>,
}))

vi.mock('@/components/ai/AiCompletionStatusPopover', () => ({
  AiCompletionStatusPopover: ({ onOpenSettings }: { onOpenSettings: () => void }) => (
    <button type="button" onClick={onOpenSettings}>
      AI completion
    </button>
  ),
}))

describe('status bar information priority', () => {
  it('assigns AI lower priority than save status while preserving its settings action', () => {
    const onOpenSettings = vi.fn()
    render(
      <AppStatusBarRight
        activePath="README.md"
        activeSaveState={{ status: 'saving' }}
        assetSyncFailed={0}
        assetSyncLastError={null}
        assetSyncPending={0}
        dirtyCount={1}
        dirtyPaths={{ 'README.md': true }}
        saveStates={{}}
        terminalOpen={false}
        workspaceKey="notes"
        statusBarVisible
        readOnlyMode={false}
        onToggleReadOnly={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
      { wrapper: TooltipProvider },
    )

    const aiButton = screen.getByRole('button', { name: 'AI completion' })
    expect(aiButton.closest('[data-status-priority]')).toHaveAttribute(
      'data-status-priority',
      'tertiary',
    )
    expect(screen.getByText('save.saving')).toHaveAttribute('data-status-priority', 'secondary')
    expect(screen.getByRole('status')).toHaveAttribute('data-status-priority', 'primary')
    expect(screen.getByRole('button', { name: 'statusBar.enableReadOnly' })).toHaveAttribute(
      'data-status-priority',
      'primary',
    )
    fireEvent.click(aiButton)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('hides tertiary controls before secondary information without hiding primary controls', async () => {
    const { container } = render(
      <AppStatusBarRight
        activePath="README.md"
        activeSaveState={{ status: 'saving' }}
        assetSyncFailed={0}
        assetSyncLastError={null}
        assetSyncPending={0}
        dirtyCount={1}
        dirtyPaths={{ 'README.md': true }}
        saveStates={{}}
        terminalOpen={false}
        workspaceKey="notes"
        statusBarVisible
        readOnlyMode={false}
        onToggleReadOnly={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
      { wrapper: TooltipProvider },
    )
    const elements = [...container.querySelectorAll<HTMLElement>('[class]')]
    const compiler = await compile('@tailwind utilities;')
    const css = parse(compiler.build(elements.flatMap((element) => [...element.classList])))
    const hiddenAtWidth = new Map<string, Element[]>()
    css.walkAtRules('media', (media) => {
      const hidden: Element[] = []
      media.walkRules((rule) => {
        rule.walkDecls('display', (declaration) => {
          if (declaration.value === 'none') {
            hidden.push(...elements.filter((element) => element.matches(rule.selector)))
          }
        })
      })
      hiddenAtWidth.set(media.params.replaceAll(' ', ''), hidden)
    })
    const ai = screen.getByRole('button', { name: 'AI completion' }).parentElement
    const saving = screen.getByText('save.saving')
    expect(hiddenAtWidth.get('(max-width:960px)')).toContain(ai)
    expect(hiddenAtWidth.get('(max-width:960px)')).not.toContain(saving)
    expect(hiddenAtWidth.get('(max-width:800px)')).toContain(saving)
    const hidden = [...hiddenAtWidth.values()].flat()
    expect(hidden).not.toContain(screen.getByRole('status'))
    expect(hidden).not.toContain(screen.getByRole('button', { name: 'statusBar.enableReadOnly' }))
  })
})
