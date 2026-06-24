import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { BICUBIC, createICNS, createICO } from 'png2icons'

type PngBuffersBySize = Record<number, Buffer | Uint8Array>

const __filename = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(__filename)
const projectRoot = path.resolve(scriptDir, '..')
const ICON_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024] as const
const HIGH_QUALITY_DPI = 300
const SCALE_RENDERER = BICUBIC
const NUM_COLORS = 0

const resolveSourceSvg = (): string => {
  const candidates = [
    path.join(projectRoot, 'public', 'marklab-dark.svg'),
    path.join(projectRoot, 'public', 'marklab.svg'),
  ]

  const sourceSvg = candidates.find(existsSync)
  if (!sourceSvg) {
    throw new Error(`Cannot find a source svg: ${candidates.join(', ')}`)
  }
  return sourceSvg
}

const getProjectSource = (): { sourceSvg: string } => ({
  sourceSvg: resolveSourceSvg(),
})

const renderPng = (svg: string, size: number): Uint8Array => {
  const instance = new Resvg(svg, {
    dpi: HIGH_QUALITY_DPI,
    shapeRendering: 2,
    textRendering: 2,
    imageRendering: 0,
    fitTo: { mode: 'width', value: size },
  })
  return instance.render().asPng()
}

const writeIfBuffer = (
  filePath: string,
  buffer: Buffer | Uint8Array | null,
  label: string,
): void => {
  if (!buffer) {
    throw new Error(`Failed to generate ${label}`)
  }
  writeFileSync(filePath, Buffer.from(buffer as Uint8Array))
}

const main = (): void => {
  const outputDir = path.join(projectRoot, 'resources', 'icons')
  mkdirSync(outputDir, { recursive: true })

  const { sourceSvg } = getProjectSource()
  const sourceContent = readFileSync(sourceSvg, 'utf8')

  const iconPathBySize: PngBuffersBySize = {}

  for (const size of ICON_SIZES) {
    const buffer = renderPng(sourceContent, size)
    iconPathBySize[size] = buffer
    writeFileSync(path.join(outputDir, `marklab-${size}.png`), buffer)
  }

  const largestPng = iconPathBySize[1024]
  if (!largestPng) {
    throw new Error('Expected 1024px icon source not generated')
  }

  writeFileSync(path.join(outputDir, 'marklab.png'), largestPng)
  const ico = createICO(Buffer.from(largestPng), SCALE_RENDERER, NUM_COLORS, true, true)
  writeIfBuffer(path.join(outputDir, 'marklab.ico'), ico, 'marklab.ico')
  const icns = createICNS(Buffer.from(largestPng), SCALE_RENDERER, NUM_COLORS)
  writeIfBuffer(path.join(outputDir, 'marklab.icns'), icns, 'marklab.icns')
}

main()
