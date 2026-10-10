import { PlateElement, PlateLeaf, type PlateElementProps, type PlateLeafProps } from 'platejs/react'
import { FrontmatterElement } from '@/components/plate/frontmatter/FrontmatterElement'

export const ParagraphElement = (props: PlateElementProps) => {
  if (props.element.preservedMarkdownKind === 'yaml') return <FrontmatterElement {...props} />
  return <PlateElement {...props} as="p" className="my-2 leading-7" />
}

export const H1Element = (props: PlateElementProps) => (
  <PlateElement {...props} as="h1" className="mb-4 mt-8 text-3xl font-bold tracking-tight" />
)
export const H2Element = (props: PlateElementProps) => (
  <PlateElement {...props} as="h2" className="mb-3 mt-7 text-2xl font-semibold tracking-tight" />
)
export const H3Element = (props: PlateElementProps) => (
  <PlateElement {...props} as="h3" className="mb-2 mt-6 text-xl font-semibold" />
)
export const H4Element = (props: PlateElementProps) => (
  <PlateElement {...props} as="h4" className="mb-2 mt-5 text-lg font-semibold" />
)
export const H5Element = (props: PlateElementProps) => (
  <PlateElement {...props} as="h5" className="mb-2 mt-4 text-base font-semibold" />
)
export const H6Element = (props: PlateElementProps) => (
  <PlateElement {...props} as="h6" className="mb-2 mt-4 text-sm font-semibold uppercase" />
)

export const BlockquoteElement = (props: PlateElementProps) => (
  <PlateElement
    {...props}
    as="blockquote"
    className="my-4 border-l-4 border-border pl-4 text-muted-foreground"
  />
)

export const HorizontalRuleElement = (props: PlateElementProps) => (
  <PlateElement {...props} as="div" className="my-6">
    <hr className="border-border" contentEditable={false} />
    <span className="sr-only">{props.children}</span>
  </PlateElement>
)

export const BoldLeaf = (props: PlateLeafProps) => <PlateLeaf {...props} as="strong" />
export const ItalicLeaf = (props: PlateLeafProps) => <PlateLeaf {...props} as="em" />
export const StrikethroughLeaf = (props: PlateLeafProps) => <PlateLeaf {...props} as="s" />
export const InlineCodeLeaf = (props: PlateLeafProps) => (
  <PlateLeaf
    {...props}
    as="code"
    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]"
  />
)
