import { render, screen } from '@testing-library/react'
import { BlockSelectionPlugin } from '@platejs/selection/react'
import { createPlateEditor, Plate } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { PlateBlockSelectionCount } from '@/components/plate/selection/PlateBlockSelectionCount'

const renderCount = (ids: string[]) => {
  const editor = createPlateEditor({
    plugins: [BlockSelectionPlugin],
    value: ids.map((id) => ({ children: [{ text: id }], id, type: 'p' })),
  })
  editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set(ids))
  return render(
    <Plate editor={editor}>
      <PlateBlockSelectionCount />
    </Plate>,
  )
}

describe('PlateBlockSelectionCount', () => {
  it('announces a multi-block selection count', () => {
    renderCount(['a', 'b', 'c'])

    expect(screen.getByRole('status', { name: '3 blocks selected' })).toHaveTextContent('3')
  })

  it('stays out of the way for a single selected block', () => {
    renderCount(['a'])

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
