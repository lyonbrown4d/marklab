import fs from 'node:fs/promises'
import path from 'node:path'

export const atomicInstallFile = async (
  temporaryPath: string,
  finalPath: string,
): Promise<void> => {
  const temporary = await fs.open(temporaryPath, 'r+')
  try {
    await temporary.sync()
  } finally {
    await temporary.close()
  }
  await fs.rename(temporaryPath, finalPath)
  await syncDirectory(path.dirname(finalPath))
}

export const syncDirectory = async (directory: string): Promise<void> => {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    handle = await fs.open(directory, 'r')
    await handle.sync()
  } catch (error) {
    if (process.platform !== 'win32') throw error
  } finally {
    await handle?.close()
  }
}
