import { PlateElement, type PlateElementProps } from 'platejs/react'

export const HtmlDetailsElement = (props: PlateElementProps) => {
  const open = (props.element as { open?: boolean }).open === true
  const detailsProps = { open }
  return (
    <PlateElement
      {...props}
      {...detailsProps}
      as="details"
      className="my-4 rounded-lg border border-border bg-muted/20 px-4 py-3"
    />
  )
}

export const HtmlSummaryElement = (props: PlateElementProps) => (
  <PlateElement
    {...props}
    as="summary"
    className="cursor-pointer select-none font-medium text-foreground outline-none"
  />
)

export const HtmlKbdElement = (props: PlateElementProps) => (
  <PlateElement
    {...props}
    as="kbd"
    className="mx-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.85em] shadow-sm"
  />
)

export const HtmlBreakElement = (props: PlateElementProps) => (
  <PlateElement {...props} as="span">
    <span contentEditable={false}>
      <br />
    </span>
    <span className="sr-only">{props.children}</span>
  </PlateElement>
)
