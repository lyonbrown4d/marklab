import { useMemoizedFn } from 'ahooks'
import type { PlateEditorSurfaceProps } from '@/components/plate/plateEditorSurfaceTypes'
import type { PlateEditor } from 'platejs/react'
import type { PlateSurfaceCompletionBindings } from '@/components/plate/usePlateSurfaceCompletions'
import { usePlateMarkdownDiagnostics } from '@/components/plate/usePlateMarkdownDiagnostics'

type SurfaceDecorationOptions = Pick<
  PlateEditorSurfaceProps,
  'activePath' | 'readOnly' | 'value' | 'workspaceKey'
> & {
  completion: PlateSurfaceCompletionBindings
  editor: PlateEditor
  enabled: boolean
  getMarkdown: () => Promise<string>
}

export const usePlateSurfaceDecorations = ({
  activePath,
  completion,
  editor,
  enabled,
  getMarkdown,
  readOnly = false,
  value,
  workspaceKey,
}: SurfaceDecorationOptions) => {
  const diagnostics = usePlateMarkdownDiagnostics({
    activePath,
    editor,
    enabled,
    getMarkdown,
    readOnly,
    value,
    workspaceKey,
  })
  const decorate = useMemoizedFn(({ entry }: Parameters<typeof completion.decorate>[0]) => [
    ...completion.decorate({ entry }),
    ...diagnostics.decorate({ entry }),
  ])
  return { decorate, scheduleDiagnostics: diagnostics.schedule }
}
