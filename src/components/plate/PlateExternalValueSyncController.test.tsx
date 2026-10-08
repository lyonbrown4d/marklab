import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const syncMock = vi.hoisted(() => ({
  applyPending: vi.fn(() => false),
  loading: true,
}))

vi.mock('@/components/plate/usePlateExternalValueSync', () => ({
  usePlateExternalValueSync: () => syncMock,
}))

import { PlateExternalValueSyncController } from '@/components/plate/PlateExternalValueSyncController'

const controllerRef = createRef<{ applyPending: () => boolean }>()
const editableRef = createRef<HTMLDivElement>()
const loadingRef = { current: false }
const stableRef = { current: '' }
const renderController = (contentReady: boolean) => (
  <>
    <div data-testid="editor" ref={editableRef} />
    <PlateExternalValueSyncController
      cancelSnapshot={vi.fn()}
      changeRevisionRef={{ current: 0 }}
      composingRef={{ current: false }}
      contentReady={contentReady}
      controllerRef={controllerRef}
      editableRef={editableRef}
      editor={{} as never}
      externalApplyRef={{ current: false }}
      latestExternalValueRef={stableRef}
      loadingRef={loadingRef}
      localEchoRef={{ current: null }}
      readOnly={false}
      ready
      value=""
    />
  </>
)

describe('PlateExternalValueSyncController', () => {
  beforeEach(() => {
    syncMock.loading = true
  })

  it('keeps the editor semantically gated without deferring its layout', () => {
    const view = render(renderController(true))
    const editor = screen.getByTestId('editor')

    expect(editor).toHaveAttribute('inert')
    expect(editor).toHaveAttribute('aria-hidden', 'true')
    expect(editor).not.toHaveClass('invisible')

    syncMock.loading = false
    view.rerender(renderController(true))

    expect(editor).not.toHaveAttribute('inert')
    expect(editor).not.toHaveAttribute('aria-hidden')
    expect(editor).not.toHaveClass('invisible')
  })
})
