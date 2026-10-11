import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RightSidebarBacklinksPanel } from '@/components/RightSidebarBacklinksPanel'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'

beforeEach(async () => {
  vi.clearAllMocks()
  usePreferencesStore.setState({ locale: 'en-US' })
  await i18n.changeLanguage('en-US')
  i18n.addResourceBundle(
    'en-US',
    'translation',
    {
      'inspector.unlinkedMentions': 'Unlinked mentions',
      'inspector.unlinkedMentionsLoading': 'Searching for unlinked mentions',
    },
    true,
    true,
  )
  i18n.addResourceBundle(
    'zh-CN',
    'translation',
    {
      'inspector.unlinkedMentions': '未链接提及',
      'inspector.unlinkedMentionsLoading': '正在搜索未链接提及',
    },
    true,
    true,
  )
})

const props = {
  backlinks: [
    {
      sourcePath: 'linked.md',
      text: 'Target',
      context: 'See [Target](target.md)',
      line: 2,
      column: 5,
    },
  ],
  mentions: [
    {
      sourcePath: 'notes/plain.md',
      text: 'Target',
      context: 'Target appears without a link',
      line: 4,
      column: 1,
      endColumn: 7,
    },
  ],
  mentionsError: null,
  mentionsLoading: false,
  targetLabel: 'Target',
  onOpenBacklink: vi.fn(),
  onOpenMention: vi.fn(),
  onRetryMentions: vi.fn(),
}

describe('RightSidebarBacklinksPanel', () => {
  it('keeps probable mentions in a distinct group and opens their source', () => {
    render(<RightSidebarBacklinksPanel {...props} />)

    expect(screen.getByText('File references')).toBeInTheDocument()
    expect(screen.getByText('Unlinked mentions')).toBeInTheDocument()
    const mention = screen.getByText('plain').closest('button')
    expect(mention).toBeInTheDocument()
    fireEvent.click(mention!)
    expect(props.onOpenMention).toHaveBeenCalledWith(props.mentions[0])
    expect(props.onOpenBacklink).not.toHaveBeenCalled()
  })

  it('filters explicit backlinks and mentions with the same search field', async () => {
    render(<RightSidebarBacklinksPanel {...props} />)
    const search = screen.getByRole('searchbox')

    await userEvent.type(search, 'plain')

    expect(screen.queryByText('linked')).not.toBeInTheDocument()
    expect(screen.getByText('plain')).toBeInTheDocument()
  })

  it.each([
    ['en-US', 'Unlinked mentions', 'Searching for unlinked mentions'],
    ['zh-CN', '未链接提及', '正在搜索未链接提及'],
  ] as const)(
    'localizes the mention heading and loading state in %s',
    async (locale, heading, loading) => {
      usePreferencesStore.setState({ locale })
      await i18n.changeLanguage(locale)

      render(<RightSidebarBacklinksPanel {...props} mentionsLoading />)

      expect(screen.getByText(heading)).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent(loading)
      expect(screen.queryByText('inspector.unlinkedMentions')).not.toBeInTheDocument()
      if (locale === 'zh-CN') {
        expect(screen.queryByText('Unlinked mentions')).not.toBeInTheDocument()
        expect(screen.queryByText('Searching for unlinked mentions')).not.toBeInTheDocument()
      }
    },
  )
})
