import { render, screen } from '@testing-library/react'
import { BlockSelectionPlugin } from '@platejs/selection/react'
import { createPlateEditor, Plate } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { PlateSelectionStats } from '@/components/plate/selection/PlateSelectionStats'

const createEditor = () =>
  createPlateEditor({
    plugins: [BlockSelectionPlugin],
    value: [
      { children: [{ text: 'Hello brave world' }], id: 'a', type: 'p' },
      { children: [{ text: 'Second block' }], id: 'b', type: 'p' },
      { children: [{ text: 'Third block' }], id: 'c', type: 'p' },
    ],
  })

const renderStats = (configure: (editor: ReturnType<typeof createEditor>) => void) => {
  const editor = createEditor()
  configure(editor)
  return render(
    <Plate editor={editor}>
      <PlateSelectionStats />
    </Plate>,
  )
}

describe('PlateSelectionStats', () => {
  it('shows word and non-whitespace character counts for a text selection', () => {
    renderStats((editor) => {
      editor.tf.select({
        anchor: { offset: 0, path: [0, 0] },
        focus: { offset: 11, path: [0, 0] },
      })
    })

    expect(screen.getByRole('status', { name: '2 words · 10 chars' })).toHaveTextContent(
      '2 words · 10 chars',
    )
  })

  it('announces a multi-block selection count instead of text stats', () => {
    renderStats((editor) => {
      editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set(['a', 'b', 'c']))
    })

    expect(screen.getByRole('status', { name: '3 blocks selected' })).toHaveTextContent('3')
    expect(screen.getByTestId('plate-block-selection-count')).toBeVisible()
  })

  it('stays hidden for one selected block even if a text range is stale', () => {
    renderStats((editor) => {
      editor.tf.select({
        anchor: { offset: 0, path: [0, 0] },
        focus: { offset: 5, path: [0, 0] },
      })
      editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set(['a']))
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('stays hidden for a collapsed text selection', () => {
    renderStats((editor) => editor.tf.select({ offset: 2, path: [0, 0] }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
