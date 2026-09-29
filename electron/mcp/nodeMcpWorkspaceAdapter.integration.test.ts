import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { NodeMcpWorkspaceAdapter } from '@electron/mcp/nodeMcpWorkspaceAdapter.js'
import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('NodeMcpWorkspaceAdapter', () => {
  it('reads the persisted Node search snapshot without mutating the workspace', async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-mcp-'))
    temporaryRoots.push(temporaryRoot)
    const workspaceRoot = path.join(temporaryRoot, 'workspace')
    const engineDataDir = path.join(temporaryRoot, 'engine')
    await Promise.all([
      fs.mkdir(workspaceRoot, { recursive: true }),
      fs.mkdir(engineDataDir, { recursive: true }),
    ])
    const index = new NodeSearchIndex(engineDataDir)
    await index.rebuild([
      {
        content: 'alpha context lives here',
        path: 'notes/project.md',
        title: 'Project',
      },
    ])
    const adapter = await NodeMcpWorkspaceAdapter.open({ engineDataDir, workspaceRoot })

    const result = await adapter.searchWorkspace('alpha', 5)
    const status = await adapter.getWorkspaceStatus()

    expect(result).toMatchObject({
      limit: 5,
      query: 'alpha',
      resultCount: 1,
      totalHits: 1,
    })
    expect(result.results[0]).toMatchObject({
      documentId: 'notes/project.md',
      path: 'notes/project.md',
      title: 'Project',
    })
    expect(status).toMatchObject({
      engineDataDir: await fs.realpath(engineDataDir),
      health: { ok: true, searchableDocuments: '1' },
      index: { ready: true, searchIndex: 'node-json' },
      workspaceRoot: await fs.realpath(workspaceRoot),
    })
    expect(Number(status.storage.searchIndexBytes)).toBeGreaterThan(0)
  })

  it('rejects missing or non-directory workspace paths', async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-mcp-invalid-'))
    temporaryRoots.push(temporaryRoot)
    const engineDataDir = path.join(temporaryRoot, 'engine')
    const workspaceFile = path.join(temporaryRoot, 'workspace.md')
    await fs.mkdir(engineDataDir)
    await fs.writeFile(workspaceFile, '# not a directory', 'utf8')

    await expect(
      NodeMcpWorkspaceAdapter.open({
        engineDataDir,
        workspaceRoot: path.join(temporaryRoot, 'missing'),
      }),
    ).rejects.toThrow()
    await expect(
      NodeMcpWorkspaceAdapter.open({ engineDataDir, workspaceRoot: workspaceFile }),
    ).rejects.toThrow('workspace root must be a directory')
  })

  it('keeps explicitly configured workspace processes isolated', async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-mcp-isolation-'))
    temporaryRoots.push(temporaryRoot)
    const workspaceA = path.join(temporaryRoot, 'workspace-a')
    const workspaceB = path.join(temporaryRoot, 'workspace-b')
    const engineA = path.join(temporaryRoot, 'engine-a')
    const engineB = path.join(temporaryRoot, 'engine-b')
    await Promise.all(
      [workspaceA, workspaceB, engineA, engineB].map((directory) =>
        fs.mkdir(directory, { recursive: true }),
      ),
    )
    await Promise.all([
      new NodeSearchIndex(engineA).rebuild([
        { content: 'alpha only', path: 'alpha.md', title: 'Alpha' },
      ]),
      new NodeSearchIndex(engineB).rebuild([
        { content: 'beta only', path: 'beta.md', title: 'Beta' },
      ]),
    ])
    const [adapterA, adapterB] = await Promise.all([
      NodeMcpWorkspaceAdapter.open({ engineDataDir: engineA, workspaceRoot: workspaceA }),
      NodeMcpWorkspaceAdapter.open({ engineDataDir: engineB, workspaceRoot: workspaceB }),
    ])

    const [alphaInA, alphaInB, statusA, statusB] = await Promise.all([
      adapterA.searchWorkspace('alpha', 10),
      adapterB.searchWorkspace('alpha', 10),
      adapterA.getWorkspaceStatus(),
      adapterB.getWorkspaceStatus(),
    ])

    expect(alphaInA.results.map((result) => result.path)).toEqual(['alpha.md'])
    expect(alphaInB.results).toEqual([])
    expect(statusA.workspaceRoot).toBe(await fs.realpath(workspaceA))
    expect(statusB.workspaceRoot).toBe(await fs.realpath(workspaceB))
  })
})
