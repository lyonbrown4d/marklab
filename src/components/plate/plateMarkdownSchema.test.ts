import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import {
  plateMarkdownListCapability,
  plateMarkdownNodeSchema,
} from '@/components/plate/plateMarkdownSchema'
import { createPlateMarkdownWorkerEditor } from '@/components/plate/plateMarkdownWorkerConfig'

describe('Plate Markdown renderer and worker schema parity', () => {
  it('matches renderer node metadata for every shared Markdown node', () => {
    const editor = createPlateEditor({ plugins: createPlateEditorPlugins() })

    for (const node of plateMarkdownNodeSchema) {
      if (!node.renderer) continue
      const plugin = editor.getPlugin({ key: node.key })
      expect(plugin.node.type ?? plugin.key, node.key).toBe(node.type)
      expect(Boolean(plugin.node.isInline), `${node.key} inline`).toBe(node.inline)
      expect(Boolean(plugin.node.isVoid), `${node.key} void`).toBe(node.void)
    }
  })

  it('generates worker queries and the classic-list capability from the shared schema', () => {
    const editor = createPlateMarkdownWorkerEditor()
    const worker = editor as unknown as {
      api: {
        create: { block: () => { children: Array<{ text: string }>; type: string } }
        isBlock: (node: { children: never[]; type: string }) => boolean
        isInline: (node: { children: never[]; type: string }) => boolean
        isVoid: (node: { children: never[]; type: string }) => boolean
      }
      getOptions: () => unknown
      getType: (key: string) => string
      meta: { pluginCache: { node: { types: Record<PropertyKey, string | undefined> } } }
      plugins: Record<string, { key: string }>
    }

    for (const node of plateMarkdownNodeSchema) {
      const value = { children: [], type: node.type }
      expect(worker.api.isBlock(value), `${node.key} block`).toBe(!node.inline)
      expect(worker.api.isInline(value), `${node.key} inline`).toBe(node.inline)
      expect(worker.api.isVoid(value), `${node.key} void`).toBe(node.void)
    }
    expect(worker.plugins.list).toBe(worker.plugins[plateMarkdownListCapability.pluginKey])
    expect(worker.plugins.list).toMatchObject({ key: 'listClassic' })
    expect(worker.api.create.block()).toEqual({ children: [{ text: '' }], type: 'p' })
    expect(worker.getOptions()).toBeDefined()
    const knownNode = plateMarkdownNodeSchema[0]
    expect(knownNode).toBeDefined()
    expect(worker.getType(knownNode!.key)).toBe(knownNode!.type)
    expect(worker.getType('unknown-worker-node')).toBe('unknown-worker-node')
    expect(worker.meta.pluginCache.node.types.paragraph).toBe('paragraph')
    expect(worker.meta.pluginCache.node.types.undefined).toBeUndefined()
    expect(worker.meta.pluginCache.node.types[Symbol('node')]).toBeUndefined()
  })

  it('fails fast when conversion requests an undeclared plugin key', () => {
    const editor = createPlateMarkdownWorkerEditor()

    expect(() => editor.getPlugin({ key: 'undeclaredMarkdownNode' })).toThrow(
      'Plate plugin "undeclaredMarkdownNode" is unavailable in the Markdown worker schema.',
    )
  })
})
