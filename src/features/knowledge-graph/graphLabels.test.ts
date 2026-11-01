import { describe, expect, it, vi } from 'vitest'
import {
  createGraphLabelMeasurer,
  createGraphLabels,
  fitGraphLabel,
  layoutGraphLabels,
} from '@/features/knowledge-graph/graphLabels'
import { createKnowledgeTopology } from '@/features/knowledge-graph/graphologyAdapter'
import { testGraph } from '@/features/knowledge-graph/testGraph'

type Box = { left: number; right: number; top: number; bottom: number }
const intersects = (a: Box, b: Box) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
const measure = (text: string) => [...text].length * 8

// These are actual viewport coordinates; zoom changes node separation and glyph size independently.
const denseNodes = (ratio: number) =>
  Array.from({ length: 72 }, (_, index) => ({
    id: String(index),
    label: `知识图谱与项目架构设计说明文档-${index}.md`,
    x: 360 + ((index % 12) - 5.5) * (44 / ratio),
    y: 240 + (Math.floor(index / 12) - 2.5) * (52 / ratio),
    size: 12 / Math.sqrt(ratio),
  }))

describe('graph label readability', () => {
  it.each([0.05, 0.35, 1, 3, 8])(
    'keeps visible names clear of every icon, label and viewport edge at camera ratio %s',
    (ratio) => {
      const nodes = denseNodes(ratio)
      const labels = layoutGraphLabels(nodes, { width: 720, height: 480 }, ['29'], measure)
      const displayed = [...labels.values()]
      for (const [index, { bounds }] of displayed.entries()) {
        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.top).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(720)
        expect(bounds.bottom).toBeLessThanOrEqual(480)
        displayed
          .slice(index + 1)
          .forEach((other) => expect(intersects(bounds, other.bounds)).toBe(false))
        nodes.forEach(({ x, y, size }) =>
          expect(
            intersects(bounds, {
              left: x - size,
              right: x + size,
              top: y - size,
              bottom: y + size,
            }),
          ).toBe(false),
        )
      }
      if (ratio === 1) {
        expect(labels.size).toBeGreaterThan(0)
        expect(labels.size).toBeLessThan(nodes.length)
      }
    },
  )
  it('gives the hovered or selected name the first available space and restores its full name', () => {
    const label = '知识图谱架构与桌面工作区的完整文件名称说明.md'
    const nodes = ['ordinary', 'selected'].map((id) => ({ id, label, x: 80, y: 120, size: 12 }))
    const ordinary = layoutGraphLabels(nodes, { width: 640, height: 300 }, [], measure)
    expect(ordinary.get('ordinary')?.label).toContain('…')
    const focused = layoutGraphLabels(nodes, { width: 640, height: 300 }, ['selected'], measure)
    expect(focused.get('selected')?.label).toBe(label)
    expect(nodes[0].label).toBe(label)
  })
  it('suppresses names when icons occupy all available space, even for selection', () => {
    const nodes = Array.from({ length: 25 }, (_, index) => ({
      id: String(index),
      label: '文件名称',
      x: (index % 5) * 20 + 10,
      y: Math.floor(index / 5) * 20 + 10,
      size: 11,
    }))
    expect(layoutGraphLabels(nodes, { width: 100, height: 100 }, ['12'], measure).size).toBe(0)
  })
  it('fits Unicode names by measured glyph advances without splitting graphemes', () => {
    const context = { font: '', measureText: vi.fn(() => ({ width: 32 })) }
    const glyphWidth = createGraphLabelMeasurer(context as unknown as CanvasRenderingContext2D)
    expect(glyphWidth('中文')).toBe(12)
    expect(glyphWidth('中文')).toBe(12)
    expect(context.measureText).toHaveBeenCalledTimes(2)
    const width = (text: string) => [...new Intl.Segmenter().segment(text)].length * 12
    expect(fitGraphLabel('👩🏽‍💻中文文件', 36, width)).toBe('👩🏽‍💻中…')
    expect(fitGraphLabel('完整', 36, width)).toBe('完整')
    expect(fitGraphLabel('名称', 4, width)).toBe('')
  })
  it('refreshes only changed display labels through public Sigma APIs and releases listeners', () => {
    const palette = {
      file: '#000',
      preview: '#000',
      missing: '#000',
      foreground: '#000',
      muted: '#000',
      edge: '#000',
      primary: '#000',
      background: '#fff',
    }
    const graph = createKnowledgeTopology(testGraph(), {}, palette)
    const context = { measureText: (text: string) => ({ width: [...text].length * 32 }) }
    const canvas = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as CanvasRenderingContext2D)
    const events = new Map<string, (...args: never[]) => void>()
    let ratio = 1
    const renderer = {
      getCamera: () => ({ getState: () => ({ ratio }) }),
      getDimensions: () => ({ width: 640, height: 480 }),
      graphToViewport: (node: { x: number; y: number }) => ({
        x: 200 + node.x / ratio,
        y: 200 + node.y / ratio,
      }),
      scaleSize: (size: number) => size / Math.sqrt(ratio),
      refresh: vi.fn(),
      on: (event: string, callback: (...args: never[]) => void) => events.set(event, callback),
      off: (event: string) => events.delete(event),
    }
    try {
      const labels = createGraphLabels(graph)
      const unbind = labels.bind(renderer as unknown as Parameters<typeof labels.bind>[0])
      expect(renderer.refresh).toHaveBeenCalledWith(
        expect.objectContaining({ skipIndexation: true, schedule: true }),
      )
      renderer.refresh.mockClear()
      events.get('beforeRender')?.()
      events.get('afterProcess')?.()
      expect(renderer.refresh).not.toHaveBeenCalled()
      ratio = 8
      events.get('beforeRender')?.()
      expect(renderer.refresh).toHaveBeenCalledOnce()
      expect(labels.style('file:a.md').labelVisibility).toBe('hidden')
      labels.select('file:a.md')
      events.get('beforeRender')?.()
      expect(labels.style('file:a.md')).toMatchObject({
        labelVisibility: 'visible',
        labelDepth: 'topNodes',
      })
      renderer.refresh.mockClear()
      events.get('beforeRender')?.()
      expect(renderer.refresh).not.toHaveBeenCalled()
      unbind()
      expect(events.size).toBe(0)
    } finally {
      canvas.mockRestore()
    }
  })
})
