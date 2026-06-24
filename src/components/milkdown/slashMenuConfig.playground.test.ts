import { CrepeFeature, type CrepeConfig } from '@milkdown/crepe'
import { commandsCtx, editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { clearTextInCurrentBlockCommand } from '@milkdown/kit/preset/commonmark'
import { Slice } from '@milkdown/kit/prose/model'
import { describe, expect, it, vi } from 'vitest'
import {
  createMarkdownPlaygroundSlashConfig,
  createSlashMenuConfig,
} from '@/components/milkdown/slashMenuConfig'
import { slashMenuTestLabels as labels } from '@/components/milkdown/slashMenuConfigTestFixtures'

describe('playground slash menu config', () => {
  it('exposes a typed BlockEdit config without overriding official block handle options', () => {
    const blockEditConfig = createMarkdownPlaygroundSlashConfig({
      labels,
      onCalendarFileCreate: async () => null,
      onImageImport: async () => true,
    })
    const featureConfigs: CrepeConfig['featureConfigs'] = {
      [CrepeFeature.BlockEdit]: blockEditConfig,
    }

    expect(featureConfigs?.[CrepeFeature.BlockEdit]).toBe(blockEditConfig)
    expect(blockEditConfig.textGroup?.label).toBe('Text')
    expect(blockEditConfig.advancedGroup?.image).toBeNull()
    expect(blockEditConfig.buildMenu).toEqual(expect.any(Function))
    expect(blockEditConfig).not.toHaveProperty('blockHandle')
    expect(blockEditConfig).not.toHaveProperty('handleAddIcon')
    expect(blockEditConfig).not.toHaveProperty('handleDragIcon')
  })

  it('inserts markdown returned by the playground calendar callback', async () => {
    const onCalendarFileCreate = vi.fn(async () => '[Calendar](<./calendar.ics>)\n')
    const config = createSlashMenuConfig(labels, async () => true, onCalendarFileCreate)
    const addItem = vi.fn()
    const call = vi.fn()
    const parser = vi.fn(() => ({ content: { childCount: 1 } }))
    const replaceRange = vi.fn(function replaceRange() {
      return tr
    })
    const scrollIntoView = vi.fn(function scrollIntoView() {
      return tr
    })
    const tr = { replaceRange, scrollIntoView }
    const view = {
      dispatch: vi.fn(),
      focus: vi.fn(),
      state: {
        selection: {
          $from: {
            after: vi.fn(() => 12),
            before: vi.fn(() => 3),
            depth: 1,
          },
          from: 5,
          to: 5,
        },
        tr,
      },
    }

    config.buildMenu({
      getGroup: vi.fn(() => ({ addItem })),
    })

    const [, item] = addItem.mock.calls.find(([key]) => key === 'calendar-file') as [
      string,
      { onRun: (ctx: { get: (token: unknown) => unknown }) => void },
    ]

    item.onRun({
      get: (token) => {
        if (token === commandsCtx) return { call }
        if (token === editorViewCtx) return view
        if (token === parserCtx) return parser
        return null
      },
    })
    await Promise.resolve()

    expect(onCalendarFileCreate).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith(clearTextInCurrentBlockCommand.key)
    expect(parser).toHaveBeenCalledWith('[Calendar](<./calendar.ics>)\n')
    expect(replaceRange).toHaveBeenCalledWith(3, 12, expect.any(Slice))
    expect(view.dispatch).toHaveBeenCalledWith(tr)
    expect(view.focus).toHaveBeenCalledTimes(1)
  })
})
