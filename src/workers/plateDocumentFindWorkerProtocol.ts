export type PlateDocumentFindWorkerOptions = {
  matchCase: boolean
  useRegex: true
  wholeWord: boolean
}

export type PlateDocumentFindTextEntry = {
  path: number[]
  text: string
}

export type PlateDocumentFindTextBlock = {
  entries: PlateDocumentFindTextEntry[]
}

export type PlateDocumentFindRegexContext = {
  captures: Array<string | undefined>
  groups: Record<string, string | undefined>
  match: string
  prefix: string
  suffix: string
}

export type PlateDocumentFindWorkerMatch = {
  anchor: { offset: number; path: number[] }
  focus: { offset: number; path: number[] }
  regex: PlateDocumentFindRegexContext
}

export type PlateDocumentFindWorkerScan = {
  options: PlateDocumentFindWorkerOptions
  query: string
  source: PlateDocumentFindTextBlock[]
}
