import fs from 'node:fs/promises'

export const deleteWorkspacePathWithNode = async (
  absolutePath: string,
): Promise<'file' | 'folder'> => {
  const stat = await fs.stat(absolutePath)
  if (stat.isDirectory()) {
    await fs.rm(absolutePath, { recursive: true, force: false })
    return 'folder'
  }

  await fs.unlink(absolutePath)
  return 'file'
}
