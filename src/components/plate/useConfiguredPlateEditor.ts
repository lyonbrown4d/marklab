import { useMemoizedFn } from 'ahooks'
import { usePlateEditor } from 'platejs/react'
import {
  createPlateEditorPlugins,
  plateChunkingOptions,
} from '@/components/plate/plateEditorConfig'
import type { PlateEditorSurfaceProps } from '@/components/plate/plateEditorSurfaceTypes'
import { loadPlateMarkdown } from '@/services/plateMarkdownWorkerClient'

type ConfiguredPlateEditorOptions = Pick<
  PlateEditorSurfaceProps,
  'activePath' | 'onWorkspaceLink' | 'value'
> & {
  asyncInitialValue: boolean
}

export const useConfiguredPlateEditor = ({
  activePath,
  asyncInitialValue,
  onWorkspaceLink,
  value,
}: ConfiguredPlateEditorOptions) => {
  const handleWorkspaceLink = useMemoizedFn((target: string, documentPath: string | null) =>
    onWorkspaceLink?.(target, documentPath),
  )

  return usePlateEditor(
    {
      chunking: plateChunkingOptions,
      nodeId: true,
      plugins: createPlateEditorPlugins({
        getDocumentPath: () => activePath,
        onWorkspaceLink: handleWorkspaceLink,
      }),
      value: asyncInitialValue
        ? [{ type: 'p', children: [{ text: '' }] }]
        : (instance) => loadPlateMarkdown(instance, value),
    },
    [activePath],
  )
}
