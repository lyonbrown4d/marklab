import type { Edge } from '@xyflow/react'

type Paint = {
  stroke: string
  width: number
  opacity: number
  dash: number[]
  offset: number
  cap: CanvasLineCap
}
type Sample = { element: SVGPathElement; paint: Paint }
type EdgeSample = { edge: Edge; element: SVGPathElement; sample: Sample }

const readPaint = (element: SVGPathElement): Paint => {
  const style = getComputedStyle(element)
  return {
    stroke: style.stroke,
    width: Number.parseFloat(style.strokeWidth) || 0,
    opacity: Number(style.opacity) * Number(style.strokeOpacity),
    dash:
      style.strokeDasharray === 'none'
        ? []
        : style.strokeDasharray.split(/[ ,]+/).map(Number.parseFloat),
    offset: Number.parseFloat(style.strokeDashoffset) || 0,
    cap:
      style.strokeLinecap === 'round' || style.strokeLinecap === 'square'
        ? style.strokeLinecap
        : 'butt',
  }
}

// Let the existing stylesheet and native CSS transitions resolve colors/easing.
// Equal destinations AND equal current paints can share one transition sample.
export const createWorkspaceMapCanvasEdgeStyles = () => {
  let samples = new Map<string, Sample>()
  let edgeSamples = new Map<string, EdgeSample>()
  return {
    refresh: (root: SVGSVGElement, edges: Edge[], force = false) => {
      const previous = edgeSamples
      samples = new Map()
      edgeSamples = new Map()
      const elements = new Map(
        Array.from(root.querySelectorAll<SVGPathElement>('path')).map((element) => [
          element.dataset.edgeId,
          element,
        ]),
      )
      for (const edge of edges) {
        const element = elements.get(edge.id)
        if (!element) continue
        const cached = previous.get(edge.id)
        const paint =
          !force && cached?.edge === edge && cached.element === element
            ? cached.sample.paint
            : readPaint(element)
        const key = JSON.stringify([edge.className, edge.style, paint])
        let sample = samples.get(key)
        if (!sample) {
          sample = { element, paint }
          samples.set(key, sample)
        }
        edgeSamples.set(edge.id, { edge, element, sample })
      }
    },
    update: () => {
      let animating = false
      for (const sample of samples.values()) {
        sample.paint = readPaint(sample.element)
        animating ||=
          sample.element
            .getAnimations?.()
            .some((animation) => animation.playState === 'running' || animation.pending) ?? false
      }
      return animating
    },
    get: (id: string) => edgeSamples.get(id)?.sample.paint,
  }
}
