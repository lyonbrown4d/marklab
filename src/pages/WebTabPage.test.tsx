import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceTab } from '@/store/appTypes'

type WebTab = Extract<WorkspaceTab, { kind: 'web' }>

const context = vi.hoisted(() => ({
  tabs: [
    {
      kind: 'web',
      id: 'first',
      title: 'First',
      url: 'https://example.com/first',
    },
  ] as WebTab[],
  onCloseActiveTab: vi.fn(),
}))

vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: (selector: (value: typeof context) => unknown) => selector(context),
}))
vi.mock('@/store/useWorkspaceStore', () => ({
  useWorkspaceStore: (selector: (value: typeof context) => unknown) => selector(context),
}))
vi.mock('@/pages/web/WebTabSurface', () => {
  const MockWebTabSurface = ({ tab }: { tab: WebTab }) => {
    const [mountedFor] = useState(tab.id)
    return <output>{`${mountedFor}:${tab.id}`}</output>
  }
  return { default: MockWebTabSurface }
})

import WebTabPage from '@/pages/WebTabPage'

const RouteHarness = () => {
  const navigate = useNavigate()
  return (
    <>
      <button type="button" onClick={() => navigate('/web/second')}>
        Switch
      </button>
      <Routes>
        <Route path="/web/:tabId" element={<WebTabPage />} />
      </Routes>
    </>
  )
}

describe('WebTabPage', () => {
  it('remounts the native surface when switching between web tabs', () => {
    render(
      <MemoryRouter initialEntries={['/web/first']}>
        <RouteHarness />
      </MemoryRouter>,
    )
    expect(screen.getByText('first:first')).toBeVisible()

    context.tabs = [
      {
        kind: 'web',
        id: 'second',
        title: 'Second',
        url: 'https://example.com/second',
      },
    ]
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))

    expect(screen.getByText('second:second')).toBeVisible()
  })
})
