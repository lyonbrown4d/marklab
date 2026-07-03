import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RightSidebarPropertiesPanel } from '@/components/RightSidebarPropertiesPanel'

const translations = vi.hoisted(() => ({
  'common.no': 'No',
  'common.yes': 'Yes',
  'inspector.absolutePath': 'Absolute path',
  'inspector.backlinks': 'Backlinks',
  'inspector.kind': 'Kind',
  'inspector.loading': 'Loading',
  'inspector.modified': 'Modified',
  'inspector.none': 'No metadata',
  'inspector.outline': 'Outline',
  'inspector.path': 'Path',
  'inspector.properties': 'Properties',
  'inspector.readonly': 'Read-only',
  'inspector.size': 'Size',
  'inspector.unknown': 'Unknown',
  'status.lines': 'Lines',
  'status.words': 'Words',
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: keyof typeof translations) => translations[key] ?? key,
  }),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({
    children,
    className,
    viewportClassName,
  }: {
    children: ReactNode
    className?: string
    viewportClassName?: string
  }) => (
    <section
      aria-label="Properties panel"
      className={className}
      data-viewport-class={viewportClassName}
    >
      {children}
    </section>
  ),
}))

vi.mock('@/components/RightSidebarPrimitives', () => ({
  PropertyCell: ({ label, value }: { label: ReactNode; value: ReactNode }) => (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  ),
}))

const baseProps = {
  backlinksCount: 3,
  documentStats: {
    lines: 42,
    words: 512,
  },
  loadingMetadata: false,
  outlineCount: 7,
}

describe('RightSidebarPropertiesPanel', () => {
  it('renders loading and empty metadata states', () => {
    render(<RightSidebarPropertiesPanel {...baseProps} displayMetadata={null} loadingMetadata />)

    expect(screen.getByLabelText('Properties panel')).toHaveClass('h-full')
    expect(screen.getByLabelText('Properties panel')).toHaveAttribute('data-viewport-class', 'p-2')
    expect(screen.getByText('Properties')).toBeInTheDocument()
    expect(screen.getByText('Loading')).toBeInTheDocument()
    expect(screen.getByText('No metadata')).toBeInTheDocument()
  })

  it('renders metadata details with gap-based vertical spacing', () => {
    const { container } = render(
      <RightSidebarPropertiesPanel
        {...baseProps}
        displayMetadata={{
          absolute_path: 'D:\\Projects\\marklab\\notes\\daily.md',
          kind: 'file',
          modified_ms: undefined,
          path: 'notes/daily.md',
          readonly: true,
          size_bytes: 2048,
        }}
      />,
    )

    expect(container.querySelector('.space-y-2')).toBeNull()
    expect(container.querySelector('[class~="gap-2"]')).not.toBeNull()

    expect(screen.getByText('Lines')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Words')).toBeInTheDocument()
    expect(screen.getByText('512')).toBeInTheDocument()
    expect(screen.getByText('Outline')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('Backlinks')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('file')).toBeInTheDocument()
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.getByText('Yes')).toBeInTheDocument()
    expect(screen.getByText('notes/daily.md')).toBeInTheDocument()
    expect(screen.getByText('D:\\Projects\\marklab\\notes\\daily.md')).toBeInTheDocument()
  })
})
