import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const markdownFixture = vi.hoisted(() => ({
  value: [
    {
      caption: [{}, { text: ' ' }],
      children: [{ text: '' }],
      title: ' ',
      type: 'img',
      url: 'fallback.png',
    },
    { children: [{ text: '' }], type: 'img' },
    { children: [{ text: '' }], type: 'footnoteReference' },
    {
      children: [{ children: [{ text: 'Missing identifier' }], type: 'p' }],
      type: 'footnoteDefinition',
    },
  ],
}))

vi.mock('@/components/plate/plateMarkdownSerialization', () => ({
  deserializePlateMarkdown: () => markdownFixture.value,
}))

import { WorkspaceMapStaticMarkdownPreview } from '@/pages/workspace-map/WorkspaceMapStaticMarkdownPreview'

describe('WorkspaceMapStaticMarkdownPreview defensive node rendering', () => {
  it('renders useful fallbacks for incomplete image and footnote metadata', () => {
    const { container } = render(<WorkspaceMapStaticMarkdownPreview markdown="# ignored" />)

    expect(screen.getByText('fallback.png')).toBeInTheDocument()
    expect(screen.getByText('Missing identifier')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slate-type="img"]')).toHaveLength(2)
    expect(container.querySelector('[role="doc-footnote"]')).toHaveAttribute('aria-label', '[^]')
  })
})
