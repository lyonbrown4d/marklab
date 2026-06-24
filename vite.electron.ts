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
  if (normalizedId.includes('awilix')) return 'main-di'
  if (
    includesAny(normalizedId, [
      'fast-glob',
      'micromatch',
      'picomatch',
      'braces',
      'glob-parent',
      'is-glob',
      'is-extglob',
      'to-regex-range',
      'fill-range',
      '@nodelib/',
      'merge2',
      'queue-microtask',
      'run-parallel',
      'reusify',
      'fastq',
    ])
  ) {
    return 'main-glob'
  }
  if (includesAny(normalizedId, ['@grpc/grpc-js', '@grpc/proto-loader', '@bufbuild/protobuf'])) {
    return 'main-grpc'
  }
  if (normalizedId.includes('rxjs')) return 'main-rxjs'
  if (
    includesAny(normalizedId, [
      'rehype-stringify',
      'remark-rehype',
      'hast-util-',
      'mdast-util-to-hast',
      'property-information',
      'stringify-entities',
      'character-entities-legacy',
      'comma-separated-tokens',
      'space-separated-tokens',
      'trim-lines',
      'unist-util-position',
      'micromark-util-sanitize-uri',
      '@ungap/structured-clone',
    ])
  ) {
    return 'main-markdown-html'
  }
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
  if (includesAny(normalizedId, ['simple-git', 'diff', '@kwsites/'])) return 'main-git'
  if (normalizedId.includes('chokidar')) return 'main-watcher'
  if (
    includesAny(normalizedId, [
      'axios',
      'proxy-from-env',
      'agent-base',
      'delayed-stream',
      'follow-redirects',
      'form-data',
    ])
  ) {
    return 'main-http'
  }
  if (normalizedId.includes('lodash-es')) return 'main-lodash'

  return undefined
}
