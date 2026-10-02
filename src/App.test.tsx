import { act, render, screen } from '@testing-library/react'
import { Outlet } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from '@/App'

vi.mock('@/app/AppLayout', () => ({
  default: () => <Outlet />,
}))

vi.mock('@/pages/WorkspaceRootPage', () => ({
  default: () => <div>Workspace root</div>,
}))

describe('App root route', () => {
  it('mounts the file-resolving root route instead of the legacy dashboard', async () => {
    window.location.hash = '#/'
    render(<App />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Workspace root')).toBeInTheDocument()
    expect(screen.queryByText('Workspace dashboard')).not.toBeInTheDocument()
  })
})
