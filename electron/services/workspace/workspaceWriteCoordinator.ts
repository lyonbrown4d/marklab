import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  canonicalWorkspaceAbsoluteKey,
  canonicalWorkspaceWriteIdentity,
  isMissingError,
  type CanonicalWriteIdentity,
} from '@electron/services/workspace/workspaceWriteIdentity.js'

export {
  canonicalWorkspaceAbsoluteKey,
  canonicalWorkspaceRelativeKey,
  canonicalWorkspaceWriteIdentity,
} from '@electron/services/workspace/workspaceWriteIdentity.js'

export type WorkspaceMutationPath = { absolutePath: string; includeDescendants?: boolean }

export type WorkspaceWriteClaim = {
  absolutePath: string
  baselineContent: string | null | undefined
  content: string
  recordKey: string
}

type WorkspaceWriteCommit = {
  absolutePath: string
  baselineContent: string | null | undefined
  content: string
  ownerId: string
  recordKey: string
  write: (writePath: string) => Promise<void>
}

export class WorkspaceWriteConflictError extends Error {
  readonly code = 'workspace_write_conflict' as const
  constructor(
    message: string,
    readonly absolutePath: string,
  ) {
    super(message)
    this.name = 'WorkspaceWriteConflictError'
  }
}

const claimsByOwner = new Map<string, WorkspaceWriteClaim[]>()
const persistedBaselines = new Map<string, string | null>()
type ProcessMutationContext = { active: boolean; ownerId: string }
type ActiveWriter =
  | { kind: 'buffer'; ownerId: string; recordKey: string }
  | { kind: 'mutation'; ownerId: string; context: ProcessMutationContext }
const mutationContext = new AsyncLocalStorage<ProcessMutationContext>()
let activeWriter: ActiveWriter | null = null
let claimsEpoch = 0
let nextOwnerId = 0
let tempFileNonce = 0
let writeTail: Promise<void> = Promise.resolve()

const readPersistedContent = async (absolutePath: string): Promise<string | null> => {
  try {
    return await fs.readFile(absolutePath, 'utf8')
  } catch (error) {
    if (isMissingError(error)) return null
    throw error
  }
}

const assertClaimsCompatible = async (
  commit: WorkspaceWriteCommit,
  identity: CanonicalWriteIdentity,
): Promise<void> => {
  const snapshots = [...claimsByOwner].flatMap(([ownerId, claims]) =>
    claims.map((claim) => ({ claim, ownerId })),
  )
  for (const snapshot of snapshots) {
    if (snapshot.ownerId === commit.ownerId && snapshot.claim.recordKey === commit.recordKey) {
      continue
    }
    const claimedIdentity = await canonicalWorkspaceWriteIdentity(snapshot.claim.absolutePath)
    if (claimedIdentity.key !== identity.key) continue
    throw new WorkspaceWriteConflictError(
      'Another buffer has unsaved content for ' + commit.absolutePath,
      commit.absolutePath,
    )
  }
}

const commitWorkspaceWriteNow = async (
  commit: WorkspaceWriteCommit,
): Promise<{ identityKey: string }> => {
  const identity = await canonicalWorkspaceWriteIdentity(commit.absolutePath)

  while (true) {
    const observedClaimsEpoch = claimsEpoch
    await assertClaimsCompatible(commit, identity)
    const diskContent = await readPersistedContent(identity.writePath)
    if (observedClaimsEpoch !== claimsEpoch) continue
    if (commit.baselineContent === undefined) {
      throw new WorkspaceWriteConflictError(
        'Cannot save before its persisted baseline is known: ' + commit.absolutePath,
        commit.absolutePath,
      )
    }
    if (
      persistedBaselines.has(identity.key) &&
      persistedBaselines.get(identity.key) !== commit.baselineContent
    ) {
      throw new WorkspaceWriteConflictError(
        'The in-process persisted baseline changed for ' + commit.absolutePath,
        commit.absolutePath,
      )
    }
    if (diskContent !== commit.baselineContent) {
      throw new WorkspaceWriteConflictError(
        'The file changed outside this buffer: ' + commit.absolutePath,
        commit.absolutePath,
      )
    }
    if (observedClaimsEpoch !== claimsEpoch) continue
    activeWriter = { kind: 'buffer', ownerId: commit.ownerId, recordKey: commit.recordKey }
    break
  }

  try {
    await commit.write(identity.writePath)
    const persistedContent = await readPersistedContent(identity.writePath)
    if (persistedContent !== commit.content) {
      throw new WorkspaceWriteConflictError(
        'The persisted file did not match the buffered content: ' + commit.absolutePath,
        commit.absolutePath,
      )
    }
  } finally {
    activeWriter = null
  }

  const committedIdentity = await canonicalWorkspaceWriteIdentity(identity.writePath)
  persistedBaselines.set(identity.key, commit.content)
  persistedBaselines.set(committedIdentity.key, commit.content)
  return { identityKey: committedIdentity.key }
}

export const createWorkspaceWriteOwner = (): string => 'workspace-buffer-' + (nextOwnerId += 1)

export const assertWorkspaceClaimMutationAllowed = (ownerId: string, recordKey?: string): void => {
  if (!activeWriter) return
  if (
    activeWriter.kind === 'buffer' &&
    activeWriter.ownerId === ownerId &&
    activeWriter.recordKey === recordKey
  )
    return
  const context = mutationContext.getStore()
  if (
    activeWriter.kind === 'mutation' &&
    activeWriter.ownerId === ownerId &&
    activeWriter.context === context &&
    context?.active === true
  )
    return
  throw new WorkspaceWriteConflictError(
    'Another workspace operation is currently mutating process filesystem state',
    '<process>',
  )
}

export const replaceWorkspaceWriteClaims = (
  ownerId: string,
  claims: WorkspaceWriteClaim[],
): void => {
  if (claims.length === 0) claimsByOwner.delete(ownerId)
  else
    claimsByOwner.set(
      ownerId,
      claims.map((claim) => ({ ...claim })),
    )
  claimsEpoch += 1
}

export const releaseWorkspaceWriteOwner = (ownerId: string): void => {
  if (claimsByOwner.delete(ownerId)) claimsEpoch += 1
}

export const commitWorkspaceWrite = (
  commit: WorkspaceWriteCommit,
): Promise<{ identityKey: string }> => {
  const run = writeTail.then(
    () => commitWorkspaceWriteNow(commit),
    () => commitWorkspaceWriteNow(commit),
  )
  writeTail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export const writeWorkspaceFileAtomically = async (
  absolutePath: string,
  content: string,
): Promise<void> => {
  const directory = path.dirname(absolutePath)
  await fs.mkdir(directory, { recursive: true })
  tempFileNonce += 1
  const temporaryPath = path.join(
    directory,
    '.' + path.basename(absolutePath) + '.' + process.pid + '.' + tempFileNonce + '.tmp',
  )
  try {
    await fs.writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' })
    await fs.rename(temporaryPath, absolutePath)
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

type CanonicalMutationPath = WorkspaceMutationPath & {
  identity: Awaited<ReturnType<typeof canonicalWorkspaceWriteIdentity>>
}
type WorkspacePathMutation<T> = {
  ownerId: string
  paths: WorkspaceMutationPath[]
  work: () => Promise<T>
}
const isWithinMutationScope = (candidate: string, scope: string): boolean => {
  const candidateKey = canonicalWorkspaceAbsoluteKey(candidate)
  const scopeKey = canonicalWorkspaceAbsoluteKey(scope)
  return candidateKey === scopeKey || candidateKey.startsWith(scopeKey + '/')
}
const canonicalizeMutationPaths = async (
  paths: WorkspaceMutationPath[],
): Promise<CanonicalMutationPath[]> =>
  (
    await Promise.all(
      paths.map(async (scope) => ({
        ...scope,
        identity: await canonicalWorkspaceWriteIdentity(scope.absolutePath),
      })),
    )
  ).sort(
    (left, right) =>
      left.identity.key.localeCompare(right.identity.key) ||
      left.identity.writePath.localeCompare(right.identity.writePath) ||
      Number(left.includeDescendants) - Number(right.includeDescendants),
  )
const assertMutationPathsAvailable = async (scopes: CanonicalMutationPath[]): Promise<void> => {
  for (const ownerClaims of claimsByOwner.values()) {
    for (const claim of ownerClaims) {
      const identity = await canonicalWorkspaceWriteIdentity(claim.absolutePath)
      for (const scope of scopes) {
        const conflict =
          identity.key === scope.identity.key ||
          (scope.includeDescendants &&
            isWithinMutationScope(identity.writePath, scope.identity.writePath))
        if (conflict)
          throw new WorkspaceWriteConflictError(
            'Cannot mutate ' +
              scope.absolutePath +
              ' while unsaved buffer ' +
              claim.recordKey +
              ' targets it',
            scope.absolutePath,
          )
      }
    }
  }
}
const runWorkspacePathMutationNow = async <T>(options: WorkspacePathMutation<T>): Promise<T> => {
  if (options.paths.length === 0) throw new Error('Workspace mutation requires a path')
  while (true) {
    const observedEpoch = claimsEpoch
    const scopes = await canonicalizeMutationPaths(options.paths)
    await assertMutationPathsAvailable(scopes)
    if (observedEpoch !== claimsEpoch) continue
    const context: ProcessMutationContext = { active: true, ownerId: options.ownerId }
    activeWriter = { kind: 'mutation', ownerId: options.ownerId, context }
    try {
      return await mutationContext.run(context, options.work)
    } finally {
      context.active = false
      activeWriter = null
    }
  }
}
export const runWorkspacePathMutation = <T>(options: WorkspacePathMutation<T>): Promise<T> => {
  const current = mutationContext.getStore()
  if (current?.active) {
    if (current.ownerId !== options.ownerId) {
      return Promise.reject(new Error('Nested workspace mutation changed write owner'))
    }
    return canonicalizeMutationPaths(options.paths)
      .then(assertMutationPathsAvailable)
      .then(options.work)
  }
  const run = writeTail.then(
    () => runWorkspacePathMutationNow(options),
    () => runWorkspacePathMutationNow(options),
  )
  writeTail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
