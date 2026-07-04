import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownMediaPreview } from '@/components/milkdown/MarkdownMediaPreview'

const messages: Record<string, string> = {
  'preview.kind.audio': 'Audio',
  'preview.kind.video': 'Video',
  'preview.mediaLoading': 'Loading {{kind}} preview...',
  'preview.mediaFailed': '{{kind}} preview is unavailable',
  'preview.mediaReady': '{{kind}} preview is ready',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const template = messages[key] ?? key
      return template.replace(/{{(\w+)}}/g, (_, optionKey: string) =>
        String(options?.[optionKey] ?? ''),
      )
    },
  }),
}))

describe('MarkdownMediaPreview', () => {
  it('uses localized status text when media preview is unavailable', () => {
    render(
      <MarkdownMediaPreview href="audio/missing.mp3" kind="audio" src="" title="Missing audio" />,
    )

    expect(screen.getByText('AUDIO')).toHaveClass('bg-secondary', 'text-secondary-foreground')
    expect(screen.getAllByText('Audio preview is unavailable').length).toBeGreaterThan(0)
    expect(screen.getByRole('status')).toHaveTextContent('Audio preview is unavailable')
  })
})
