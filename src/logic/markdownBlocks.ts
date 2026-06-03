export type MarkdownBlockContentMode = 'none' | 'summary' | 'full'

export type MarkdownBlock =
  | {
      id: string
      kind: 'heading'
      level: number
      text: string
      editable: boolean
    }
  | {
      id: string
      kind: 'paragraph'
      text: string
      editable: boolean
    }
  | {
      id: string
      kind: 'blockquote'
      text: string
      editable: boolean
    }
  | {
      id: string
      kind: 'code'
      text: string
      language?: string
      editable: boolean
    }
  | {
      id: string
      kind: 'list'
      ordered: boolean
      items: string[]
      editable: boolean
    }
  | {
      id: string
      kind: 'divider'
      editable: boolean
    }
  | {
      id: string
      kind: 'table'
      text: string
      editable: boolean
    }

export type MarkdownBlockCommit = {
  id: string
  text: string
}

export type MarkdownBlockRole = 'title' | 'content'

export type MarkdownBlockCommitTarget = 'title' | 'content' | 'block' | 'none'

export type MarkdownBlockViewModel = MarkdownBlock & {
  role: MarkdownBlockRole
  commitTarget: MarkdownBlockCommitTarget
}

type HeadingSectionBlocksArgs = {
  headingId: string
  level: number
  title: string
  content?: string
  contentBlocks?: MarkdownBlock[]
  contentMode: MarkdownBlockContentMode
  editable: boolean
}

export const createHeadingSectionBlocks = ({
  headingId,
  level,
  title,
  content,
  contentBlocks,
  contentMode,
  editable,
}: HeadingSectionBlocksArgs): MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = [
    {
      id: `${headingId}:heading`,
      kind: 'heading',
      level,
      text: title,
      editable,
    },
  ]

  if (contentMode === 'full' && contentBlocks?.length) {
    blocks.push(
      ...contentBlocks.map((block) => ({
        ...block,
        editable: editable && isEditableContentBlock(block),
      })),
    )
    return blocks
  }

  const displayContent = formatContentForMode(content, contentMode)
  if (displayContent) {
    blocks.push({
      id: `${headingId}:content`,
      kind: 'paragraph',
      text: displayContent,
      editable: editable && contentMode === 'full',
    })
  } else if (editable && contentMode === 'full') {
    blocks.push({
      id: `${headingId}:content`,
      kind: 'paragraph',
      text: '',
      editable: true,
    })
  }

  return blocks
}

export const createHeadingSectionViewModel = (
  args: HeadingSectionBlocksArgs,
): MarkdownBlockViewModel[] => {
  const headingId = `${args.headingId}:heading`
  const fallbackContentId = `${args.headingId}:content`

  return createHeadingSectionBlocks(args).map((block): MarkdownBlockViewModel => {
    if (block.id === headingId) {
      return {
        ...block,
        role: 'title',
        commitTarget: block.editable ? 'title' : 'none',
      }
    }

    if (block.id === fallbackContentId) {
      return {
        ...block,
        role: 'content',
        commitTarget: block.editable ? 'content' : 'none',
      }
    }

    return {
      ...block,
      role: 'content',
      commitTarget: block.editable ? 'block' : 'none',
    }
  })
}

export const formatContentForMode = (
  content: string | undefined,
  mode: MarkdownBlockContentMode,
) => {
  const raw = content?.trim() ?? ''
  if (!raw || mode === 'none') return ''
  if (mode === 'full') return raw
  return raw.length > 140 ? `${raw.slice(0, 140).trimEnd()}...` : raw
}

export const serializeMarkdownBlocks = (blocks: MarkdownBlock[]) => {
  return blocks.map(serializeMarkdownBlock).filter(Boolean).join('\n\n')
}

export const updateMarkdownBlockText = (blocks: MarkdownBlock[], commit: MarkdownBlockCommit) => {
  if (!blocks.some((block) => block.id === commit.id)) return null
  return blocks.map((block) => {
    if (block.id !== commit.id) return block
    if (block.kind === 'list') return { ...block, items: normalizeMarkdownListItems(commit.text) }
    if (block.kind === 'divider') return block
    return { ...block, text: commit.text }
  })
}

const isEditableContentBlock = (block: MarkdownBlock) => {
  return (
    block.kind === 'paragraph' ||
    block.kind === 'blockquote' ||
    block.kind === 'code' ||
    block.kind === 'list'
  )
}

const normalizeMarkdownListItems = (text: string) => {
  return text
    .split(/\r\n|\r|\n/)
    .map((item) => item.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').trim())
    .filter(Boolean)
}

const serializeMarkdownBlock = (block: MarkdownBlock) => {
  if (block.kind === 'heading') return `${'#'.repeat(block.level)} ${block.text}`
  if (block.kind === 'blockquote') {
    return block.text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
  }
  if (block.kind === 'code') {
    return `\`\`\`${block.language ?? ''}\n${block.text}\n\`\`\``
  }
  if (block.kind === 'list') {
    return block.items
      .map((item, index) => (block.ordered ? `${index + 1}. ${item}` : `- ${item}`))
      .join('\n')
  }
  if (block.kind === 'divider') return '---'
  return block.text
}

type MarkdownBlockInput = {
  id: string
  kind: 'paragraph' | 'blockquote' | 'code' | 'list' | 'divider' | 'table'
  text?: string | null
  language?: string | null
  ordered?: boolean | null
  items?: string[] | null
}

export const normalizeMarkdownBlocks = (
  blocks: MarkdownBlockInput[] | undefined,
): MarkdownBlock[] => {
  if (!blocks) return []

  return blocks.flatMap((block): MarkdownBlock[] => {
    if (block.kind === 'divider') {
      return [{ id: block.id, kind: 'divider', editable: false }]
    }
    if (block.kind === 'list') {
      const items = block.items?.filter((item) => item.trim()) ?? []
      if (items.length === 0) return []
      return [
        {
          id: block.id,
          kind: 'list',
          ordered: Boolean(block.ordered),
          items,
          editable: false,
        },
      ]
    }

    const text = block.text?.trim()
    if (!text) return []
    if (block.kind === 'code') {
      return [
        {
          id: block.id,
          kind: 'code',
          text,
          language: block.language ?? undefined,
          editable: false,
        },
      ]
    }
    if (block.kind === 'table') {
      return [
        {
          id: block.id,
          kind: 'table',
          text,
          editable: false,
        },
      ]
    }
    return [
      {
        id: block.id,
        kind: block.kind,
        text,
        editable: false,
      },
    ]
  })
}
