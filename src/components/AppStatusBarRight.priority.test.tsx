import { readFileSync } from 'node:fs'
import { fireEvent, render, screen } from '@testing-library/react'
import { parse } from 'postcss'
import { compileString } from 'sass'
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

  it('hides tertiary controls before secondary information without hiding primary controls', () => {
    const css = parse(compileString(readFileSync('src/styles/app/_shell.scss', 'utf8')).css)
    const hiddenPriorities = new Map<string, string[]>()
    css.walkAtRules('media', (media) => {
      const selectors: string[] = []
      media.walkRules((rule) => {
        rule.walkDecls('display', (declaration) => {
          if (declaration.value === 'none') selectors.push(...rule.selectors)
        })
      })
      hiddenPriorities.set(media.params, selectors)
    })

    expect(hiddenPriorities.get('(max-width: 960px)')).toContain(
      '.app-status-bar [data-status-priority=tertiary]',
    )
    expect(hiddenPriorities.get('(max-width: 800px)')).toContain(
      '.app-status-bar [data-status-priority=secondary]',
    )
    expect([...hiddenPriorities.values()].flat().join(' ')).not.toContain(
      'data-status-priority=primary',
    )
  })
})
