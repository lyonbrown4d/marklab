import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { BICUBIC, createICNS, createICO } from 'png2icons'

const __filename = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(__filename)
const projectRoot = path.resolve(scriptDir, '..')
const ICON_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]
const HIGH_QUALITY_DPI = 300
const SCALE_RENDERER = BICUBIC
const NUM_COLORS = 0

const resolveSourceSvg = () => {
  const candidates = [
    path.join(projectRoot, 'public', 'marklab-dark.svg'),
    path.join(projectRoot, 'public', 'marklab.svg'),
  ]

  const sourceSvg = candidates.find(existsSync)
  if (!sourceSvg) {
    throw new Error(
      `Cannot find a source svg: ${candidates.join(', ')}`,
    )
  }
  return sourceSvg
}

const getProjectSource = () => ({
  sourceSvg: resolveSourceSvg(),
})

const renderPng = (svg, size) => {
  const instance = new Resvg(svg, {
    dpi: HIGH_QUALITY_DPI,
    shapeRendering: 2,
    textRendering: 2,
    imageRendering: 0,
    fitTo: { mode: 'width', value: size },
  })
  return instance.render().asPng()
}

const writeIfBuffer = (filePath, buffer, label) => {
  if (!buffer) {
    throw new Error(`Failed to generate ${label}`)
  }
  writeFileSync(filePath, Buffer.from(buffer))
}

const main = () => {
  const outputDir = path.join(projectRoot, 'resources', 'icons')
  mkdirSync(outputDir, { recursive: true })

  const { sourceSvg } = getProjectSource()
  const sourceContent = readFileSync(sourceSvg, 'utf8')

  const iconPathBySize = ICON_SIZES.reduce((acc, size) => {
    const buffer = renderPng(sourceContent, size)
    acc[size] = buffer
    writeFileSync(path.join(outputDir, `marklab-${size}.png`), buffer)
    return acc
  }, {})

  const largestPng = iconPathBySize[1024]
  writeFileSync(path.join(outputDir, 'marklab.png'), largestPng)
  const ico = createICO(largestPng, SCALE_RENDERER, NUM_COLORS, true, true)
  writeIfBuffer(path.join(outputDir, 'marklab.ico'), ico, 'marklab.ico')
  const icns = createICNS(largestPng, SCALE_RENDERER, NUM_COLORS)
  writeIfBuffer(path.join(outputDir, 'marklab.icns'), icns, 'marklab.icns')
}

main()
