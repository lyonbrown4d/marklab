import fs from 'node:fs/promises'
import path from 'node:path'

export const validateWorkspaceName = (name: unknown): string => {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Workspace name is required')
  const trimmed = name.trim()
  if (
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.length > 120 ||
    /[<>:"/\\|?*]/.test(trimmed) ||
    [...trimmed].some((character) => character.charCodeAt(0) < 32) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(trimmed)
  )
    throw new Error('Invalid workspace folder name')
  return trimmed
}

export const createWorkspaceDirectory = async (
  parentPath: string,
  name: string,
): Promise<string> => {
  const safeName = validateWorkspaceName(name)
  const parent = await fs.realpath(parentPath)
  if (!(await fs.stat(parent)).isDirectory())
    throw new Error('Workspace parent must be a directory')
  const target = path.join(parent, safeName)
  try {
    await fs.mkdir(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`A file or folder already exists: ${target}`, { cause: error })
    }
    throw error
  }
  return target
}
