import { registerEditorPersistenceFlusher } from '@/app/editorCloseLifecycle'

export type GitConflictDraft = {
  content: string
  revision: string
  deleteFile: boolean
  deletionConfirmed: boolean
}
const drafts = new Map<string, GitConflictDraft>()
const saveHandlers = new Map<string, () => Promise<boolean>>()
const keyFor = (rootPath: string, path: string) => JSON.stringify([rootPath, path])
let removeGuard: (() => void) | null = null
let guardMessage = ''

export const assertGitConflictDraftsSaved = () => {
  if (drafts.size) throw new Error(guardMessage)
}
export const hasGitConflictDraft = (rootPath: string, path: string) =>
  drafts.has(keyFor(rootPath, path))
export const readGitConflictDraft = (rootPath: string, path: string) =>
  drafts.get(keyFor(rootPath, path))
export const storeGitConflictDraft = (
  rootPath: string,
  path: string,
  draft: GitConflictDraft,
  message: string,
) => {
  drafts.set(keyFor(rootPath, path), {
    content: draft.content,
    revision: draft.revision,
    deleteFile: draft.deleteFile,
    deletionConfirmed: draft.deletionConfirmed,
  })
  guardMessage = message
  removeGuard ??= registerEditorPersistenceFlusher(assertGitConflictDraftsSaved)
}
export const discardGitConflictDraft = (rootPath: string, path: string) => {
  drafts.delete(keyFor(rootPath, path))
  if (!drafts.size) {
    removeGuard?.()
    removeGuard = null
  }
}
export const registerGitConflictSaveHandler = (
  rootPath: string,
  path: string,
  save: () => Promise<boolean>,
) => {
  const key = keyFor(rootPath, path)
  saveHandlers.set(key, save)
  return () => {
    if (saveHandlers.get(key) === save) saveHandlers.delete(key)
  }
}
export const saveMountedGitConflictDraft = (rootPath: string, path: string) =>
  saveHandlers.get(keyFor(rootPath, path))?.() ?? Promise.resolve(false)

const closeHandlers = new Map<string, () => void>()
const closeRequests = new Map<string, () => void>()
export const requestGitConflictClose = (
  rootPath: string,
  path: string,
  onApproved: () => void,
): boolean => {
  const key = keyFor(rootPath, path)
  if (!drafts.has(key)) return false
  closeRequests.set(key, onApproved)
  closeHandlers.get(key)?.()
  return true
}
export const registerGitConflictCloseHandler = (
  rootPath: string,
  path: string,
  showConfirmation: () => void,
) => {
  const key = keyFor(rootPath, path)
  closeHandlers.set(key, showConfirmation)
  if (closeRequests.has(key)) showConfirmation()
  return () => {
    if (closeHandlers.get(key) === showConfirmation) closeHandlers.delete(key)
  }
}
export const cancelGitConflictClose = (rootPath: string, path: string) => {
  closeRequests.delete(keyFor(rootPath, path))
}
export const approveGitConflictClose = (rootPath: string, path: string): boolean => {
  const key = keyFor(rootPath, path)
  const close = closeRequests.get(key)
  closeRequests.delete(key)
  close?.()
  return Boolean(close)
}
