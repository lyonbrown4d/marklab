import { describe, expect, it } from 'vitest'

import { getMarkdownCodeActions } from '@electron/services/markdownLanguage/codeActions.js'
import type { MarkdownLanguageCodeAction } from '@electron/services/markdownLanguage/types.js'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'

const workspaceIndex = {
  files: [
    {
      path: 'notes/current.md',
      headings: [],
      links: [],
      assets: [],
    },
    {
      path: 'notes/target.md',
      headings: [
        {
          path: 'notes/target.md',
          level: 1,
          text: 'Known Heading',
          slug: 'known-heading',
          line: 1,
          column: 1,
        },
      ],
      links: [],
      assets: [],
    },
  ],
} satisfies FsWorkspaceIndex

const getActions = (content: string, column: number) =>
  getMarkdownCodeActions(
    {
      path: 'notes/current.md',
      content,
      line: 1,
      column,
    },
    () => Promise.resolve(workspaceIndex),
  )

const firstActionOfKind = <Kind extends MarkdownLanguageCodeAction['kind']>(
  actions: MarkdownLanguageCodeAction[],
  kind: Kind,
) => actions.find((action) => action.kind === kind)

describe('getMarkdownCodeActions', () => {
  it('offers to create a missing markdown file', async () => {
    const actions = await getActions('See [Missing](missing.md)', 18)
    const action = firstActionOfKind(actions, 'create-file')

    expect(action).toMatchObject({
      kind: 'create-file',
      path: 'notes/missing.md',
      isPreferred: true,
    })
  })

  it('offers to remove a missing heading anchor', async () => {
    const actions = await getActions('See [Missing](target.md#missing-heading)', 18)
    const action = firstActionOfKind(actions, 'replace-text')

    expect(action).toMatchObject({
      kind: 'replace-text',
      edit: {
        path: 'notes/current.md',
        line: 1,
        newText: '',
      },
      isPreferred: true,
    })
  })

  it('does not offer quick fixes for a resolved heading link', async () => {
    const actions = await getActions('See [Known](target.md#known-heading)', 18)

    expect(actions).toEqual([])
  })
})
