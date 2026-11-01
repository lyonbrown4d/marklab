import { expect, it } from 'vitest'
import { sameDockRoute } from '@/features/workbench/dockRoutes'

it('matches encoded document filenames without discarding their view or location suffix', () => {
  const raw = '/files/edit/05 🔬 实验记录.md?revision=2#heading'
  const encoded = '/files/edit/05%20%F0%9F%94%AC%20%E5%AE%9E%E9%AA%8C%E8%AE%B0%E5%BD%95.md'
  expect(sameDockRoute(raw, `${encoded}?revision=2#heading`)).toBe(true)
  expect(sameDockRoute(raw, `${encoded}?revision=3#heading`)).toBe(false)
  expect(sameDockRoute(raw, `${encoded}?revision=2#other`)).toBe(false)
  expect(sameDockRoute(raw, `${encoded.replace('/edit/', '/source/')}?revision=2#heading`)).toBe(
    false,
  )
  expect(sameDockRoute('/_diff/staged/a.md?revision=2', '/_diff/staged/a.md?revision=3')).toBe(
    false,
  )
  expect(sameDockRoute('/workspace/graph', '/workspace/graph')).toBe(true)
})
