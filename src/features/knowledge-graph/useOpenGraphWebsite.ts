import { useCallback } from 'react'
import { useOpenWebTab } from '@/app/useOpenWebTab'
import type { GraphNode } from '@/logic/graph'

export const useOpenGraphWebsite = () => {
  const openWebTab = useOpenWebTab()
  return useCallback(
    (node: Extract<GraphNode, { kind: 'external' }>) => {
      try {
        const url = new URL(node.url)
        if (url.username || url.password) return
        if (url.protocol === 'https:') openWebTab(url.href, node.label)
        // HTTP uses the same native external-link handling as Markdown anchors;
        // the application's web tabs retain their existing HTTPS-only policy.
        else if (url.protocol === 'http:') window.open(url.href, '_blank', 'noopener,noreferrer')
      } catch {
        // A malformed node must never fall through to a filesystem open.
      }
    },
    [openWebTab],
  )
}
