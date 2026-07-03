import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MarkdownSourceEditor from '@/components/MarkdownSourceEditor'
import { configureMonaco } from '@/lib/monaco'

vi.mock('@/lib/monaco', () => ({
  configureMonaco: vi.fn(),
}))

const messages: Record<string, string> = {
  'editor.sourceLoadFailed': 'Failed to load source editor: {{error}}',
  'editor.sourceLoading': 'Loading source editor...',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const message = messages[key] ?? key
      return Object.entries(values ?? {}).reduce(
        (current, [name, value]) => current.replace(`{{${name}}}`, value),
        message,
      )
    },
  }),
}))

const props = {
  activePath: 'notes/current.md',
  fileContents: {},
  files: [{ path: 'notes/current.md', kind: 'file' as const }],
  onChange: vi.fn(),
  value: '# Title',
}

type MonacoConfig = Awaited<ReturnType<typeof configureMonaco>>

beforeEach(() => {
  vi.mocked(configureMonaco).mockReset()
})

describe('MarkdownSourceEditor status states', () => {
  it('uses a localized source editor loading state', () => {
    vi.mocked(configureMonaco).mockReturnValueOnce(new Promise<MonacoConfig>(() => {}))

    render(<MarkdownSourceEditor {...props} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading source editor...')
  })

  it('uses a localized source editor failure state', async () => {
    vi.mocked(configureMonaco).mockRejectedValueOnce(new Error('network unavailable'))

    render(<MarkdownSourceEditor {...props} />)

    expect(
      await screen.findByText('Failed to load source editor: network unavailable'),
    ).toBeInTheDocument()
  })
})
