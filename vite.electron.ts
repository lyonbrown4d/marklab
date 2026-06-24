const isNodeModule = (id: string) => id.includes('/node_modules/')

const includesAny = (id: string, values: string[]) => values.some((value) => id.includes(value))

export const electronMainRequireBanner = [
  "import { createRequire as __marklabCreateRequire } from 'node:module';",
  'const require = __marklabCreateRequire(import.meta.url);',
].join('\n')

export const electronMainExternal = ['@homebridge/node-pty-prebuilt-multiarch']

export const electronMainManualChunks = (id: string) => {
  const normalizedId = id.replaceAll('\\', '/')

  if (normalizedId.includes('/electron/generated/knowledge-engine/')) {
    return 'main-knowledge-proto'
  }
  if (normalizedId.includes('/electron/services/knowledgeEngine/')) {
    return 'main-knowledge-engine'
  }
  if (normalizedId.includes('/electron/services/markdownLanguage/')) {
    return 'main-markdown-language'
  }
  if (!isNodeModule(normalizedId)) return undefined
  if (includesAny(normalizedId, ['@grpc/grpc-js', '@grpc/proto-loader', '@bufbuild/protobuf'])) {
    return 'main-grpc'
  }
  if (normalizedId.includes('rxjs')) return 'main-rxjs'
  if (
    includesAny(normalizedId, [
      'vscode-markdown-languageservice',
      'vscode-languageserver',
      'vscode-languageserver-textdocument',
      'vscode-languageserver-types',
      'unified',
      'remark-',
      'mdast-',
      'micromark',
      'unist-',
      'github-slugger',
    ])
  ) {
    return 'main-markdown-vendor'
  }
  if (includesAny(normalizedId, ['electron-log', 'electron-store', 'electron-updater'])) {
    return 'main-electron-runtime'
  }
  if (normalizedId.includes('lodash-es')) return 'main-lodash'

  return undefined
}
