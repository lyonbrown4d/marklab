export type BacklinkReference = {
  sourcePath: string
  text: string
  context: string
  line: number
  column: number
  targetAnchor?: string | null
  targetHeadingSlug?: string | null
}
