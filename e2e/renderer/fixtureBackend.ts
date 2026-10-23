import fs from 'node:fs/promises'
import path from 'node:path'
import { rendererReadyPhases, type RendererReadySignal } from '@/types/rendererReady'
// eslint-disable-next-line no-restricted-imports -- Node-run test fixtures remain outside production.
import { createFixtureBuffers } from './fixtureBuffers.js'
// eslint-disable-next-line no-restricted-imports -- Test-only capability store serves only generated fixture files.
import { createFixtureAssets } from './fixtureAssets.js'
// eslint-disable-next-line no-restricted-imports -- Test-only native command fixture.
import { readFixtureSpreadsheet } from './fixtureSpreadsheet.js'
// eslint-disable-next-line no-restricted-imports -- Test-only native publication analysis DTO.
import { readFixturePublication } from './fixturePublication.js'

type Payload = Record<string, unknown>
const record = (value: unknown): Payload => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Fixture requires an object DTO')
  return value as Payload
}
const text = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Fixture requires a string DTO field')
  return value
}

export const createFixtureBackend = async (
  initialRoot: string,
  initialFile: string,
  allowedRoots = [initialRoot],
) => {
  const roots = await Promise.all(allowedRoots.map((root) => fs.realpath(root)))
  let root = await fs.realpath(initialRoot)
  let file = initialFile
  let generation = 1
  let treeRevision = 0
  const phases: RendererReadySignal[] = []
  const diagnostics: Payload[] = []
  const settings = new Map<string, unknown>()
  const buffers = createFixtureBuffers(
    () => root,
    () => generation,
  )
  const assets = createFixtureAssets(buffers.target)
  const rootInfo = () => ({ kind: 'external' as const, path: root })
  const treeBase = () => ({ root: rootInfo(), generation, revision: treeRevision })
  const seed = () => ({
    version: 1,
    nativeGeneration: generation,
    state: {
      rootPath: root,
      rootKind: 'external',
      tabs: [{ kind: 'file', path: file, view: 'edit' }],
      activeTabId: `file:edit:${file}`,
      sidebarCollapsed: true,
      rightSidebarCollapsed: true,
    },
  })
  const entries = async (parent = '') => {
    const directory = parent ? buffers.target(parent) : root
    return (await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => !entry.isSymbolicLink())
      .map((entry) => ({
        path: parent ? `${parent}/${entry.name}` : entry.name,
        name: entry.name,
        kind: entry.isDirectory() ? ('folder' as const) : ('file' as const),
        hasChildren: entry.isDirectory(),
      }))
      .sort((left, right) => left.path.localeCompare(right.path))
  }
  const bind = async (nextRoot: string, nextFile: string) => {
    const canonical = await fs.realpath(nextRoot)
    if (!roots.includes(canonical)) throw new Error('Fixture cannot bind a non-fixture root')
    root = canonical
    file = nextFile
    generation += 1
    treeRevision = 0
    buffers.clear()
    assets.clear()
    return seed()
  }
  const invoke = async (command: string, args: Payload): Promise<unknown> => {
    const request = record(args.request ?? {})
    switch (command) {
      case 'workspace_session_seed':
        return seed()
      case 'app_get_platform':
        return {
          platform:
            process.platform === 'darwin'
              ? 'macos'
              : process.platform === 'win32'
                ? 'windows'
                : 'linux',
        }
      case 'app_ready': {
        const phase = rendererReadyPhases.find((phase) => phase === request.phase)
        if (!phase) throw new Error('Invalid fixture ready phase')
        phases.push({
          phase,
          ...(typeof request.error === 'string' ? { error: request.error } : {}),
        })
        return { ok: true }
      }
      case 'lifecycle_get_launch_info':
        return { args: [], cwd: root, deepLinks: [] }
      case 'fs_get_workspace_publication_plan':
        return readFixturePublication(
          (await entries())
            .filter((entry) => entry.kind === 'file' && /\.md$/i.test(entry.path))
            .map((entry) => entry.path),
          buffers.snapshot,
        )
      case 'fs_get_root_info':
        return rootInfo()
      case 'fs_set_root': {
        const nextRoot = text(request.path)
        if ((await fs.realpath(nextRoot)) !== root) await bind(nextRoot, file)
        return rootInfo()
      }
      case 'fs_get_snapshot':
        return { root: rootInfo(), entries: await entries() }
      case 'fs_list_entries':
        return await entries(typeof request.path === 'string' ? request.path : '')
      case 'workspace_tree_initial_file':
        return { ...treeBase(), path: file }
      case 'workspace_tree_list_children':
        return {
          ...treeBase(),
          parent: request.parent ?? '',
          nextCursor: null,
          entries: await entries(typeof request.parent === 'string' ? request.parent : ''),
        }
      case 'workspace_tree_paths_exist': {
        const paths = Array.isArray(request.paths) ? request.paths.map(text) : []
        const existing: string[] = []
        for (const relative of paths)
          if (
            await fs.stat(buffers.target(relative)).then(
              (stat) => stat.isFile(),
              () => false,
            )
          )
            existing.push(relative)
        return { ...treeBase(), existing }
      }
      case 'workspace_tree_search':
        return {
          ...treeBase(),
          entries: (await entries()).filter((entry) => entry.path.includes(text(request.query))),
        }
      case 'fs_open_buffer_snapshot':
        return buffers.snapshot(text(request.path))
      case 'fs_read_file':
      case 'fs_open_file':
        return (await buffers.snapshot(text(request.path))).content
      case 'fs_get_buffer_status':
        return buffers.status(text(request.path))
      case 'fs_apply_buffer_update':
        return buffers.apply(request)
      case 'fs_flush_buffers':
        return buffers.flush()
      case 'fs_get_background_tasks':
        return []
      case 'assets_issue_capability':
        return assets.issue(text(request.path))
      case 'spreadsheet_read_page':
        return readFixtureSpreadsheet(request, buffers.target, assets.read)
      case 'fs_resolve_markdown_asset': {
        const document = text(request.documentPath)
        buffers.target(document)
        const target = text(request.target)
        if (/^[a-z][\w+.-]*:/i.test(target) || target.startsWith('//'))
          throw new Error('Fixture supports only local Markdown assets')
        const decoded = decodeURIComponent(target.split(/[?#]/)[0])
        const relative = path.posix.join(path.posix.dirname(document), decoded)
        const exists = await fs.stat(buffers.target(relative)).then(
          (stat) => stat.isFile(),
          () => false,
        )
        return {
          source_path: document,
          target,
          relative_path: relative,
          is_external: false,
          media_type: null,
          exists,
        }
      }
      case 'fs_get_path_metadata': {
        const stat = await fs.stat(buffers.target(text(request.path)))
        return {
          path: request.path,
          kind: stat.isDirectory() ? 'folder' : 'file',
          size_bytes: stat.size,
          modified_ms: stat.mtimeMs,
          readonly: false,
        }
      }
      case 'workspace_read_text_preview':
        return { content: (await buffers.snapshot(text(request.path))).content, truncated: false }
      case 'settings_persist_get': {
        const key = text(request.key)
        if (settings.has(key)) return settings.get(key)
        if (key === 'marklab.workspace') return { version: 1, state: seed().state }
        if (key === 'marklab.preferences')
          return {
            version: 2,
            state: {
              locale: 'en-US',
              themeMode: 'system',
              vimModeEnabled: false,
              sidebarCollapsed: true,
              rightSidebarCollapsed: true,
              hideMarkdownDefaultAppPrompt: true,
            },
          }
        return null
      }
      case 'settings_persist_set':
        settings.set(text(request.key), request.value)
        return { ok: true }
      case 'settings_persist_remove':
        settings.delete(text(request.key))
        return { ok: true }
      case 'recent_workspaces_list':
        return []
      case 'themes_read_css':
        return { ok: true, css: '' }
      case 'themes_list':
        return { ok: true, themes: [] }
      case 'updates_get_state':
        return { currentVersion: '0.2.8', installOnQuit: false, status: 'unavailable' }
      case 'menu_set_locale':
        return { ok: true, locale: request.locale }
      case 'menu_dispatch':
        if (text(request.id) !== 'file.export_workspace')
          throw new Error('Unsupported fixture menu action')
        return { ok: true }
      case 'window_set_vim_keyboard_ownership':
        return
      case 'language_document_open':
      case 'language_document_change':
        return { ok: true, version: request.version }
      case 'language_document_close':
        return { ok: true }
      case 'language_diagnostics':
        return []
      case 'ai_list_providers':
        return []
      case 'web_tabs_hide':
      case 'web_tabs_set_shortcut_bindings':
        return
      case 'diagnostics_renderer_report':
        if (diagnostics.length < 500) diagnostics.push(request)
        return { ok: true }
      default:
        throw new Error(`Unimplemented renderer fixture command: ${command}`)
    }
  }
  return { assets, bind, buffers, diagnostics, invoke, phases, seed }
}

export type FixtureBackend = Awaited<ReturnType<typeof createFixtureBackend>>
