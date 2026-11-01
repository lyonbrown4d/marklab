import { useEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { Link, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'

const mounted = vi.hoisted(() => vi.fn())
vi.mock('@/app/AppLayout', () => {
  const MockAppLayout = () => {
    const location = useLocation()
    useEffect(() => {
      mounted()
    }, [])
    return (
      <main>
        <output>{location.pathname}</output>
        <Link to="/workspace/graph">Graph</Link>
      </main>
    )
  }
  return { default: MockAppLayout }
})
beforeEach(() => mounted.mockClear())

describe('App workspace routing', () => {
  it('retains the workspace shell while navigation switches the active pane route', () => {
    window.location.hash = '#/'
    render(<App />)
    const shell = screen.getByRole('main')
    expect(screen.getByRole('status')).toHaveTextContent('/')
    fireEvent.click(screen.getByRole('link', { name: 'Graph' }))
    expect(screen.getByRole('status')).toHaveTextContent('/workspace/graph')
    expect(screen.getByRole('main')).toBe(shell)
    expect(mounted).toHaveBeenCalledOnce()
  })
})
