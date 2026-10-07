export type KnowledgeLinkReference = {
  path: string
  label: string
  count: number
  firstLine: number
  firstColumn: number
  firstText: string
  firstContext: string
}

export type KnowledgeMissingReference = {
  target: string
  text: string
  linkType: 'markdown' | 'wiki'
  line: number
  column: number
  context: string
}

export type KnowledgeInsights = {
  incoming: KnowledgeLinkReference[]
  outgoing: KnowledgeLinkReference[]
  missing: KnowledgeMissingReference[]
  incomingCount: number
  outgoingCount: number
  missingCount: number
  orphan: boolean
}
