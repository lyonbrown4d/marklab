import {
  buildRules,
  convertNodesSerialize,
  mdastToSlate,
  type DeserializeMdOptions,
  type MdRoot,
  type SerializeMdOptions,
} from '@platejs/markdown'
import type { SlateEditor, TElement, Value } from 'platejs'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { createPlateHtmlMarkdownRules } from '@/components/plate/html/plateHtmlMarkdownRules'
import { createPlateMarkdownRules } from '@/components/plate/plateMarkdownRules'
import {
  plateMarkdownListCapability,
  plateMarkdownNodeSchema,
  plateMarkdownNodeSchemaByKey,
  plateMarkdownNodeSchemaByType,
} from '@/components/plate/plateMarkdownSchema'
import { plateMarkdownPluginOptions } from '@/components/plate/plateMarkdownSharedConfig'

type WorkerPluginMetadata = {
  key: string
  node: {
    isElement?: boolean
    isInline?: boolean
    isVoid?: boolean
    type: string
  }
}

type WorkerMarkdownEditor = {
  api: {
    create: { block: () => TElement }
    isBlock: (node: TElement) => boolean
    isInline: (node: TElement) => boolean
    isVoid: (node: TElement) => boolean
  }
  children: Value
  getOptions: () => typeof plateMarkdownPluginOptions
  getPlugin: (input: { key: string }) => WorkerPluginMetadata
  getType: (key: string) => string
  meta: {
    pluginCache: {
      node: { types: Record<string, string> }
    }
  }
  plugins: Record<string, WorkerPluginMetadata>
}

const identityTypes = new Proxy<Record<string, string>>(
  {},
  {
    get: (_target, type) => (typeof type === 'string' && type !== 'undefined' ? type : undefined),
  },
)

const plateMarkdownWorkerRules = createPlateMarkdownRules(
  createPlateHtmlMarkdownRules((editor, value) => serializePlateMarkdownInWorker(editor, value)),
)

const createWorkerPluginMetadata = () => {
  const plugins: Record<string, WorkerPluginMetadata> = {}
  for (const entry of plateMarkdownNodeSchema) {
    const plugin = {
      key: entry.key,
      node: {
        isElement: true,
        isInline: entry.inline,
        isVoid: entry.void,
        type: entry.type,
      },
    } satisfies WorkerPluginMetadata
    plugins[entry.key] = plugin
    plugins[entry.type] ??= plugin
  }
  const listPlugin: WorkerPluginMetadata = {
    key: plateMarkdownListCapability.pluginKey,
    node: { type: plateMarkdownListCapability.pluginKey },
  }
  plugins[plateMarkdownListCapability.pluginKey] = listPlugin
  plugins[plateMarkdownListCapability.gateKey] = listPlugin
  return plugins
}

export const createPlateMarkdownWorkerEditor = (): SlateEditor => {
  const plugins = createWorkerPluginMetadata()
  const editor: WorkerMarkdownEditor = {
    api: {
      create: { block: () => ({ children: [{ text: '' }], type: 'p' }) },
      isBlock: (node) => !plateMarkdownNodeSchemaByType.get(node.type as string)?.inline,
      isInline: (node) => plateMarkdownNodeSchemaByType.get(node.type as string)?.inline ?? false,
      isVoid: (node) => plateMarkdownNodeSchemaByType.get(node.type as string)?.void ?? false,
    },
    children: [],
    getOptions: () => plateMarkdownPluginOptions,
    getPlugin: ({ key }) => {
      const plugin = plugins[key]
      if (plugin) return plugin
      throw new Error(
        `Plate plugin "${key}" is unavailable in the Markdown worker schema. ` +
          'Update the worker compatibility boundary before using it.',
      )
    },
    getType: (key) => plateMarkdownNodeSchemaByKey.get(key)?.type ?? key,
    meta: { pluginCache: { node: { types: identityTypes } } },
    plugins,
  }

  // The Markdown package accepts a full SlateEditor although parsing only uses
  // the explicitly modeled schema/query surface above.
  return editor as unknown as SlateEditor
}

const createConversionOptions = (editor: SlateEditor) => ({
  editor,
  rules: { ...buildRules(editor), ...plateMarkdownWorkerRules },
})

export const deserializePlateMarkdownInWorker = (editor: SlateEditor, markdown: string): Value => {
  const options = createConversionOptions(editor) satisfies DeserializeMdOptions
  const processor = unified().use(remarkParse).use(plateMarkdownPluginOptions.remarkPlugins)
  const source = { value: markdown }
  const tree = processor.runSync(processor.parse(source), source) as MdRoot

  return mdastToSlate(tree, options).map((node) =>
    'text' in node ? { children: [node], type: editor.getType('p') } : node,
  )
}

export const serializePlateMarkdownInWorker = (editor: SlateEditor, value: Value): string => {
  const options = {
    ...createConversionOptions(editor),
    remarkStringifyOptions: plateMarkdownPluginOptions.remarkStringifyOptions,
  } satisfies SerializeMdOptions
  const processor = unified()
    .use(plateMarkdownPluginOptions.remarkPlugins)
    .use(remarkStringify, plateMarkdownPluginOptions.remarkStringifyOptions)
  const root: MdRoot = {
    children: convertNodesSerialize(value, options, true) as MdRoot['children'],
    type: 'root',
  }

  return processor.stringify(root)
}
