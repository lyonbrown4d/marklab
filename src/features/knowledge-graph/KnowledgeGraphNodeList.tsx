import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { graphNodeLocation, type GraphNode } from '@/logic/graph'
import { useI18n } from '@/i18n/useI18n'

type Props = {
  nodes: GraphNode[]
  selectedNodeId?: string | null
  onSelectNode: (id: string) => void
  onOpenNode: (id: string) => void
}

export const KnowledgeGraphNodeList = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  onOpenNode,
}: Props) => {
  const { t } = useI18n()
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onOpenNode(nodes[index].id)
      return
    }
    const next =
      event.key === 'ArrowDown'
        ? Math.min(index + 1, nodes.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? nodes.length - 1
              : null
    if (next === null) return
    event.preventDefault()
    const buttons = event.currentTarget.parentElement?.parentElement?.querySelectorAll('button')
    buttons?.[next]?.focus()
    onSelectNode(nodes[next].id)
  }
  return (
    <ul
      aria-label={t('knowledgeGraph.nodeList')}
      className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
    >
      {nodes.map((node, index) => (
        <li key={node.id}>
          <button
            aria-current={node.id === selectedNodeId ? 'true' : undefined}
            className={cn(
              'w-full rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
              node.id === selectedNodeId && 'bg-accent text-accent-foreground',
            )}
            onClick={() => onSelectNode(node.id)}
            onDoubleClick={() => onOpenNode(node.id)}
            onKeyDown={(event) => navigate(event, index)}
            type="button"
          >
            <span className="block truncate">{node.label}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {graphNodeLocation(node)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
