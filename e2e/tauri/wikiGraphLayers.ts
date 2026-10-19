import { browser } from '@wdio/globals'

export const probeGraphLayers = async (exercise: (mode: 'pan' | 'zoom') => Promise<unknown>) => {
  const samples = []
  const canvasEdges = await browser.execute(
    () => document.querySelector('canvas.workspace-map-overview-edges') !== null,
  )
  try {
    for (const [name, css] of [
      ['normal', ''],
      [
        'without-edge-paint',
        '.workspace-map-canvas :is(.react-flow__edges,.workspace-map-overview-edges) {display:none!important}',
      ],
      [
        'fast-edge-paint',
        '.workspace-map-canvas .react-flow__edge-path {shape-rendering:optimizeSpeed!important}',
      ],
      [
        'flat-groups',
        '.workspace-map-group-region {isolation:auto!important;contain:none!important;opacity:1!important}',
      ],
    ]) {
      if (canvasEdges && name === 'fast-edge-paint') continue
      await browser.execute((text) => {
        let style = document.querySelector<HTMLStyleElement>('#wiki-profile-layers')
        if (!style) {
          style = document.createElement('style')
          style.id = 'wiki-profile-layers'
          document.head.append(style)
        }
        style.textContent = text
      }, css)
      samples.push({ name, pan: await exercise('pan'), zoom: await exercise('zoom') })
    }
    return samples
  } finally {
    await browser.execute(() => document.querySelector('#wiki-profile-layers')?.remove())
  }
}
