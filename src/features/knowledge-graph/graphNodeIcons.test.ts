import { describe, expect, it, vi } from 'vitest'
import { graphFileIconKind, graphNodeIcon } from '@/features/knowledge-graph/graphNodeIcons'

describe('graph file icons', () => {
  it('uses the existing adapter registry and distinct Lucide artwork for supported kinds', () => {
    const cases = [
      ['notes/NOTE.MD#heading', 'markdown'],
      ['notes/page.markdown', 'markdown'],
      ['assets/photo.PNG?x=1', 'image'],
      ['assets/report.pdf', 'pdf'],
      ['assets/report.docx', 'document'],
      ['assets/sound.mp3', 'audio'],
      ['assets/movie.mp4', 'video'],
      ['assets/book.xlsx', 'spreadsheet'],
      ['assets/map.drawio', 'diagram'],
      ['assets/map.excalidraw', 'diagram'],
      ['src/main.ts', 'code'],
      ['.gitignore', 'code'],
      ['unknown.bin', 'file'],
      ['README', 'file'],
    ] as const
    const sourceByKind = new Map<string, string>()
    for (const [path, kind] of cases) {
      const node = { path, kind: 'preview' as const }
      expect(graphFileIconKind(node)).toBe(kind)
      const icon = graphNodeIcon(node)
      expect(icon.iconKind).toBe(kind)
      const svg = new DOMParser().parseFromString(
        decodeURIComponent(icon.image.split(',')[1]),
        'image/svg+xml',
      )
      expect(svg.querySelector('parsererror')).toBeNull()
      expect(svg.documentElement.getAttribute('viewBox')).toBe('0 0 24 24')
      expect(svg.querySelectorAll('path, circle, rect, line, polyline').length).toBeGreaterThan(0)
      sourceByKind.set(kind, icon.image)
    }
    expect(new Set(sourceByKind.values()).size).toBe(sourceByKind.size)
  })

  it('shows missing targets explicitly and bounds image sources by kind, never by path or theme', () => {
    expect(graphNodeIcon({ kind: 'missing', path: 'secret/report.pdf' }).iconKind).toBe('missing')
    const missing = graphNodeIcon({ kind: 'missing', path: 'absent.png' }).image
    expect(missing).not.toBe(graphNodeIcon({ kind: 'preview', path: 'absent.png' }).image)
    expect(missing).not.toBe(graphNodeIcon({ kind: 'preview', path: 'unknown.bin' }).image)
    const images = Array.from(
      { length: 10_000 },
      (_, index) => graphNodeIcon({ kind: 'preview', path: `assets/${index}.png` }).image,
    )
    expect(new Set(images).size).toBe(1)
    expect(decodeURIComponent(images[0])).not.toContain('assets/')
    expect(graphNodeIcon({ kind: 'file', path: '<script>.unknown' }).iconKind).toBe('file')
  })

  it('escapes SVG attributes and retains a safe file outline if Lucide data is unavailable', async () => {
    vi.doMock('lucide-react/icons/file', () => ({
      default: vi.fn(),
      __iconData: {
        node: [['g', {}, [['path', { d: 'M4 2h16V22H4z', 'data-note': 'a&"<>', key: 'react' }]]]],
      },
    }))
    try {
      vi.resetModules()
      const escaped = (await import('@/features/knowledge-graph/graphNodeIcons')).graphNodeIcon({
        kind: 'preview',
        path: 'unknown.bin',
      })
      const svg = new DOMParser().parseFromString(
        decodeURIComponent(escaped.image.split(',')[1]),
        'image/svg+xml',
      )
      expect(svg.querySelector('parsererror')).toBeNull()
      expect(svg.querySelector('path')?.getAttribute('data-note')).toBe('a&"<>')
      expect(svg.querySelector('path')?.hasAttribute('key')).toBe(false)
      vi.doMock('lucide-react/icons/file', () => ({ default: vi.fn() }))
      vi.resetModules()
      const fallback = (await import('@/features/knowledge-graph/graphNodeIcons')).graphNodeIcon({
        kind: 'preview',
        path: 'unknown.bin',
      })
      const fallbackSvg = new DOMParser().parseFromString(
        decodeURIComponent(fallback.image.split(',')[1]),
        'image/svg+xml',
      )
      expect(fallbackSvg.querySelector('path')).not.toBeNull()
      expect(fallbackSvg.querySelector('script')).toBeNull()
    } finally {
      vi.doUnmock('lucide-react/icons/file')
      vi.resetModules()
    }
  })
})
