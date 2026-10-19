import { useEffect, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SourceCodePage from '@/pages/SourceCodePage'

const lifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }))
vi.mock('keepalive-for-react', () => ({ useKeepAliveContext: () => ({}) }))
vi.mock('@/pages/useDocumentStats', () => ({ useDocumentStats: () => ({}) }))
vi.mock('@/components/EditorDocumentStatus', () => ({ EditorDocumentStatus: () => null }))
vi.mock('@/components/SourceCodeEditor', () => {
  const MockSourceCodeEditor = ({
    value,
    onChange,
    interactionActive,
  }: {
    value: string
    onChange: (value: string) => void
    interactionActive: boolean
  }) => {
    useEffect(() => {
      lifecycle.mounts++
      return () => {
        lifecycle.unmounts++
      }
    }, [])
    return (
      <textarea
        aria-label="Source editor"
        data-interactive={interactionActive}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  return { default: MockSourceCodeEditor }
})
vi.mock('@/components/previews/PlantUmlPreview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="plantuml">{source}</div>,
}))

const Page = ({ path }: { path: string }) => {
  const [value, setValue] = useState('@startuml\nAlice -> Bob\n@enduml')
  return (
    <SourceCodePage
      activePath={path}
      workspaceKey="wiki"
      value={value}
      files={[]}
      fileContents={{}}
      onChange={setValue}
      showStatusBar={false}
      readOnly={false}
    />
  )
}

describe('PlantUML source page', () => {
  it('keeps the editor and its model alive across preview switches and disables hidden interactions', async () => {
    lifecycle.mounts = 0
    lifecycle.unmounts = 0
    render(<Page path="diagram.puml" />)
    const editor = await screen.findByRole('textbox', { name: 'Source editor' })
    fireEvent.change(editor, { target: { value: '@startuml\nAlice -> Carol\n@enduml' } })
    fireEvent.click(screen.getByRole('button', { name: /PlantUML preview/ }))
    expect(await screen.findByTestId('plantuml')).toHaveTextContent('Carol')
    expect(editor).not.toBeVisible()
    expect(editor).toHaveAttribute('data-interactive', 'false')
    fireEvent.click(screen.getByRole('button', { name: /PlantUML preview/ }))
    await waitFor(() => expect(editor).toBeVisible())
    expect(editor).toHaveValue('@startuml\nAlice -> Carol\n@enduml')
    expect(editor).toHaveAttribute('data-interactive', 'true')
    expect(lifecycle).toEqual({ mounts: 1, unmounts: 0 })
  })

  it('keeps include fragments and ordinary source files in the source editor', async () => {
    const view = render(<Page path="shared.iuml" />)
    await screen.findByRole('textbox', { name: 'Source editor' })
    expect(screen.queryByRole('button', { name: 'PlantUML preview' })).not.toBeInTheDocument()
    view.rerender(<Page path="main.ts" />)
    expect(screen.queryByTestId('plantuml')).not.toBeInTheDocument()
  })
})
