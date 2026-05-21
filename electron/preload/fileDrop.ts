import { webUtils } from 'electron'

type FileDropHandler = (event: {
  paths: string[]
  position: {
    x: number
    y: number
  }
}) => void

export const onFileDrop = (handler: FileDropHandler): (() => void) => {
  const dragOverListener = (event: DragEvent) => {
    if (!isFileDragEvent(event)) return
    event.preventDefault()
  }

  const dropListener = (event: DragEvent) => {
    if (!isFileDragEvent(event)) return
    event.preventDefault()
    event.stopPropagation()

    const files = event.dataTransfer?.files
    if (!files) return

    const paths = getDroppedFilePaths(files)
    if (paths.length === 0) return

    handler({
      paths,
      position: getFileDropPosition(event),
    })
  }

  window.addEventListener('dragover', dragOverListener, true)
  window.addEventListener('drop', dropListener, true)
  return () => {
    window.removeEventListener('dragover', dragOverListener, true)
    window.removeEventListener('drop', dropListener, true)
  }
}

const isFileDragEvent = (event: DragEvent): boolean => {
  const types = event.dataTransfer?.types
  return Boolean(types && Array.from(types).includes('Files'))
}

const getFilePath = (file: File): string | null => {
  try {
    const resolved = webUtils.getPathForFile(file)
    if (resolved) return resolved
  } catch {
    // Electron can deny path resolution for synthetic File objects.
  }

  const legacyPath = (file as File & { path?: unknown }).path
  return typeof legacyPath === 'string' && legacyPath ? legacyPath : null
}

const getDroppedFilePaths = (files: FileList): string[] => {
  const paths = new Set<string>()
  for (const file of Array.from(files)) {
    const filePath = getFilePath(file)
    if (filePath) paths.add(filePath)
  }
  return [...paths]
}

const getFileDropPosition = (event: DragEvent): { x: number; y: number } => {
  const scale = window.devicePixelRatio || 1
  return {
    x: Math.round(event.clientX * scale),
    y: Math.round(event.clientY * scale),
  }
}
