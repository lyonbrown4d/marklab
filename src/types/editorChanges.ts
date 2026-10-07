import type { FsBufferTextChange } from '@/services/fsApiSchemas'

export type EditorTextChange = FsBufferTextChange
export type EditorChangeHandler = (value: string, changes?: EditorTextChange[]) => void
