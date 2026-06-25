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
        {
          path: 'notes/target.md',
          level: 2,
          text: 'Another Topic',
          slug: 'another-topic',
          line: 3,
          column: 1,
        },
        {
          path: 'notes/target.md',
          level: 2,
          text: 'Reference Notes',
          slug: 'reference-notes',
          line: 5,
          column: 1,
        },
        {
          path: 'notes/target.md',
          level: 2,
          text: 'Missing Heading',
          slug: 'missing-heading',
          line: 7,
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

const replaceTextActions = (actions: MarkdownLanguageCodeAction[]) =>
  actions.filter(
    (action): action is Extract<MarkdownLanguageCodeAction, { kind: 'replace-text' }> =>
      action.kind === 'replace-text',
  )

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
    const actions = await getActions('See [Missing](target.md#missing-headding)', 18)
    const action = replaceTextActions(actions).find((item) => item.edit.newText === '')

    expect(action).toMatchObject({
      kind: 'replace-text',
      edit: {
        path: 'notes/current.md',
        line: 1,
        newText: '',
      },
    })
  })

  it('offers closest heading anchor replacements for a missing heading anchor', async () => {
    const actions = await getActions('See [Missing](target.md#missing-headding)', 18)
    const replacements = replaceTextActions(actions).filter((action) => action.edit.newText !== '')

    expect(replacements.map((action) => action.edit.newText)).toEqual([
      '#missing-heading',
      '#known-heading',
      '#another-topic',
    ])
    expect(replacements[0]).toMatchObject({
      title: 'Replace missing heading anchor "#missing-headding" with "#missing-heading"',
      isPreferred: true,
    })
  })

  it('limits missing heading anchor replacements to three headings', async () => {
    const actions = await getActions('See [Missing](target.md#missing-headding)', 18)
    const replacements = replaceTextActions(actions).filter((action) => action.edit.newText !== '')

    expect(replacements).toHaveLength(3)
    expect(replacements.map((action) => action.edit.newText)).not.toContain('#reference-notes')
  })

  it('does not offer quick fixes for a resolved heading link', async () => {
    const actions = await getActions('See [Known](target.md#known-heading)', 18)

    expect(actions).toEqual([])
  })

  it('uses unsaved current-document headings before offering anchor quick fixes', async () => {
    const actions = await getActions('See [Draft](#draft)\n\n## Draft', 14)

    expect(actions).toEqual([])
  })
})
