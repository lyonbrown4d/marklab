import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { BICUBIC, createICNS, createICO } from 'png2icons'

type PngBuffersBySize = Record<number, Buffer | Uint8Array>
type IconColorMode = 'dark' | 'light'
type IconVariant = { icoFile: string; pngFile: string; sourceFile: string }

const __filename = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(__filename)
const projectRoot = path.resolve(scriptDir, '..')
const ICON_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024] as const
const HIGH_QUALITY_DPI = 300
const SCALE_RENDERER = BICUBIC
const NUM_COLORS = 0
const ICON_VARIANTS: Record<IconColorMode, IconVariant> = {
  light: {
    sourceFile: 'marklab-light.svg',
    pngFile: 'marklab-light.png',
    icoFile: 'marklab-light.ico',
  },
  dark: {
    sourceFile: 'marklab-dark.svg',
    pngFile: 'marklab-dark.png',
    icoFile: 'marklab-dark.ico',
  },
}

const resolveSourceSvg = (colorMode: IconColorMode): string => {
  const sourceSvg = path.join(
    projectRoot,
    'resources',
    'icon-sources',
    ICON_VARIANTS[colorMode].sourceFile,
  )
  if (!existsSync(sourceSvg)) throw new Error(`Cannot find source svg: ${sourceSvg}`)
  return sourceSvg
}

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

const generateColorModeAssets = (outputDir: string, colorMode: IconColorMode): PngBuffersBySize => {
  const source = readFileSync(resolveSourceSvg(colorMode), 'utf8')
  const buffers: PngBuffersBySize = {}

  for (const size of ICON_SIZES) buffers[size] = renderPng(source, size)

  const largestPng = buffers[1024]
  if (!largestPng) throw new Error(`Expected ${colorMode} 1024px icon source not generated`)
  const variant = ICON_VARIANTS[colorMode]
  writeFileSync(path.join(outputDir, variant.pngFile), largestPng)
  writeIfBuffer(
    path.join(outputDir, variant.icoFile),
    createICO(Buffer.from(largestPng), SCALE_RENDERER, NUM_COLORS, true, true),
    variant.icoFile,
  )
  return buffers
}

const main = (): void => {
  const outputDir = path.join(projectRoot, 'resources', 'icons')
  mkdirSync(outputDir, { recursive: true })

  generateColorModeAssets(outputDir, 'light')
  const darkIcons = generateColorModeAssets(outputDir, 'dark')

  for (const size of ICON_SIZES) {
    const buffer = darkIcons[size]
    if (!buffer) throw new Error(`Expected dark ${size}px icon source not generated`)
    writeFileSync(path.join(outputDir, `marklab-${size}.png`), buffer)
  }

  const largestPng = darkIcons[1024]
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
