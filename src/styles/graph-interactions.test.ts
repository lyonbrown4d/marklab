import { describe, expect, it } from 'vitest'
import {
  createKnowledgeTopology,
  readGraphPalette,
} from '@/features/knowledge-graph/graphologyAdapter'
import { testGraph } from '@/features/knowledge-graph/testGraph'

// Verify the native renderer receives resolved shared theme colors rather than
// CSS variable strings, which WebGL color parsing cannot resolve itself.
describe('knowledge graph theme integration', () => {
  it('resolves current light/dark theme tokens without leaving probe elements in the canvas', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const setTheme = (foreground: string) => {
      document.documentElement.style.setProperty('--primary', '220 80% 50%')
      document.documentElement.style.setProperty('--chart-2', '160 60% 40%')
      document.documentElement.style.setProperty('--destructive', '0 70% 50%')
      document.documentElement.style.setProperty('--foreground', foreground)
      document.documentElement.style.setProperty('--muted-foreground', '220 10% 40%')
      document.documentElement.style.setProperty('--border', '220 10% 80%')
    }
    setTheme('220 10% 10%')
    const light = readGraphPalette(container)
    setTheme('220 10% 95%')
    const dark = readGraphPalette(container)
    expect(light.foreground).not.toBe(dark.foreground)
    expect(light.file).toBe(dark.file)
    expect(container.children).toHaveLength(0)
    expect(
      createKnowledgeTopology(testGraph(), {}, dark).getNodeAttribute('missing:c.md', 'color'),
    ).toBe(dark.missing)
    container.remove()
    document.documentElement.removeAttribute('style')
  })
})
