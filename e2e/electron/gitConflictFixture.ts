import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const PREFIX = 'marklab-git-conflict-e2e-'
const isolatedGitEnvironment = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_SYSTEM: os.devNull,
  GIT_CONFIG_NOSYSTEM: '1',
}

export const runConflictGit = (root: string, args: string[]) => {
  if (
    path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith(PREFIX)
  )
    throw new Error('Git conflict commands require an isolated fixture repository')
  return execFileSync(
    'git',
    ['-c', 'user.name=Marklab E2E', '-c', 'user.email=e2e@local', ...args],
    {
      cwd: root,
      env: isolatedGitEnvironment,
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).trim()
}

export const createGitConflictFixture = (options: { deleteIncoming?: boolean } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), PREFIX))
  const file = path.join(root, 'Shared.md')
  const initial = '# Shared note\n\nBase version.\n'
  const incomingContent = '# Shared note\n\nFeature version.\n'
  const mainContent = '# Shared note\n\nMain version.\n'
  try {
    runConflictGit(root, ['init', '-b', 'main'])
    runConflictGit(root, ['config', 'core.autocrlf', 'false'])
    runConflictGit(root, ['config', 'user.name', 'Marklab E2E'])
    runConflictGit(root, ['config', 'user.email', 'e2e@example.invalid'])
    runConflictGit(root, ['config', 'commit.gpgsign', 'false'])
    fs.writeFileSync(file, initial)
    fs.writeFileSync(path.join(root, '.gitignore'), '.DS_Store\n.marklab/\n.marklab-sync/\n')
    runConflictGit(root, ['add', 'Shared.md', '.gitignore'])
    runConflictGit(root, ['commit', '-m', 'Initial note'])
    runConflictGit(root, ['switch', '-c', 'feature'])
    if (options.deleteIncoming) runConflictGit(root, ['rm', '--', 'Shared.md'])
    else fs.writeFileSync(file, incomingContent)
    runConflictGit(root, ['commit', '-am', 'Feature note'])
    const featureHead = runConflictGit(root, ['rev-parse', 'HEAD'])
    runConflictGit(root, ['switch', 'main'])
    fs.writeFileSync(file, mainContent)
    runConflictGit(root, ['commit', '-am', 'Main note'])
    return {
      root,
      file,
      mainContent,
      incomingContent: options.deleteIncoming ? null : incomingContent,
      initial,
      featureHead,
      mainHead: runConflictGit(root, ['rev-parse', 'HEAD']),
    }
  } catch (error) {
    removeGitConflictFixture(root)
    throw error
  }
}

export const removeGitConflictFixture = (root: string | undefined) => {
  if (!root) return
  const canonical = path.resolve(root)
  if (
    path.dirname(canonical) !== path.resolve(os.tmpdir()) ||
    !path.basename(canonical).startsWith(PREFIX)
  ) {
    throw new Error(`Refusing to remove unexpected Git conflict fixture: ${root}`)
  }
  fs.rmSync(canonical, { recursive: true, force: true })
}
