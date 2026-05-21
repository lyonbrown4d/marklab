import type { MarkdownBlock, MarkdownInline } from './markdown.js'
import { parseMarkdown } from './markdown.js'

type InlineRun = {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  link?: boolean
}

type ParagraphOptions = {
  style?: string
  numbering?: {
    numId: number
    level: number
  }
}

type ZipEntry = {
  name: string
  data: Uint8Array
}

const wordNamespace = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const relationshipNamespace = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"'
const officeRelationshipType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const packageRelationshipType = 'http://schemas.openxmlformats.org/package/2006/relationships'
const textEncoder = new TextEncoder()
const crcTable = createCrc32Table()

export function renderDocx(markdown: string): Uint8Array {
  return createZip([
    { name: '[Content_Types].xml', data: encodeXml(contentTypesXml()) },
    { name: '_rels/.rels', data: encodeXml(rootRelationshipsXml()) },
    { name: 'word/_rels/document.xml.rels', data: encodeXml(documentRelationshipsXml()) },
    { name: 'word/document.xml', data: encodeXml(documentXml(parseMarkdown(markdown))) },
    { name: 'word/styles.xml', data: encodeXml(stylesXml()) },
    { name: 'word/numbering.xml', data: encodeXml(numberingXml()) },
  ])
}

function documentXml(blocks: MarkdownBlock[]): string {
  let usedTitle = false
  const body = blocks
    .map((block) => {
      const result = blockXml(block, false, usedTitle)
      usedTitle = result.usedTitle
      return result.xml
    })
    .join('')

  const content = body || paragraphXml('')
  return xmlDeclaration(
    `<w:document ${wordNamespace}><w:body>${content}${sectionXml()}</w:body></w:document>`,
  )
}

function blockXml(
  block: MarkdownBlock,
  quote: boolean,
  usedTitle: boolean,
): { xml: string; usedTitle: boolean } {
  if (block.type === 'heading') {
    const style = quote
      ? 'Quote'
      : block.level === 1 && !usedTitle
        ? 'Title'
        : `Heading${block.level}`
    return {
      xml: paragraphXml(inlineRunsXml(block.children), { style }),
      usedTitle: usedTitle || block.level === 1,
    }
  }

  if (block.type === 'paragraph') {
    return {
      xml: paragraphXml(inlineRunsXml(block.children), quote ? { style: 'Quote' } : {}),
      usedTitle,
    }
  }

  if (block.type === 'blockquote') {
    let nextUsedTitle = usedTitle
    const xml = block.blocks
      .map((child) => {
        const result = blockXml(child, true, nextUsedTitle)
        nextUsedTitle = result.usedTitle
        return result.xml
      })
      .join('')
    return { xml: xml || paragraphXml('', { style: 'Quote' }), usedTitle: nextUsedTitle }
  }

  if (block.type === 'codeBlock') {
    return { xml: codeBlockXml(block.text), usedTitle }
  }

  if (block.type === 'list') {
    return {
      xml: block.items
        .map((item) =>
          paragraphXml(inlineRunsXml(item), {
            numbering: { numId: block.ordered ? 2 : 1, level: 0 },
            ...(quote ? { style: 'Quote' } : {}),
          }),
        )
        .join(''),
      usedTitle,
    }
  }

  if (block.type === 'thematicBreak') {
    return { xml: horizontalRuleXml(), usedTitle }
  }

  return { xml: tableXml(block), usedTitle }
}

function paragraphXml(runsXml: string, options: ParagraphOptions = {}): string {
  const properties: string[] = []
  if (options.style) properties.push(`<w:pStyle w:val="${escapeXmlAttribute(options.style)}"/>`)
  if (options.numbering) {
    properties.push(
      `<w:numPr><w:ilvl w:val="${options.numbering.level}"/><w:numId w:val="${options.numbering.numId}"/></w:numPr>`,
    )
  }
  const pPr = properties.length > 0 ? `<w:pPr>${properties.join('')}</w:pPr>` : ''
  return `<w:p>${pPr}${runsXml}</w:p>`
}

function codeBlockXml(text: string): string {
  const lines = text.split('\n')
  const runs = (lines.length > 0 ? lines : [''])
    .map((line, index) => `${index > 0 ? '<w:r><w:br/></w:r>' : ''}${runXml(line, { code: true })}`)
    .join('')
  return paragraphXml(runs, { style: 'CodeBlock' })
}

function tableXml(block: Extract<MarkdownBlock, { type: 'table' }>): string {
  const width = Math.max(block.header.length, ...block.rows.map((row) => row.length))
  const rows = [
    tableRowXml(padCells(block.header, width), true),
    ...block.rows.map((row) => tableRowXml(padCells(row, width), false)),
  ].join('')

  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:left w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`
}

function tableRowXml(cells: MarkdownInline[][], header: boolean): string {
  return `<w:tr>${cells.map((cell) => tableCellXml(cell, header)).join('')}</w:tr>`
}

function tableCellXml(inlines: MarkdownInline[], header: boolean): string {
  const shading = header ? '<w:shd w:fill="F3F4F6"/>' : ''
  const content = paragraphXml(inlineRunsXml(inlines, header ? { bold: true } : {}))
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${shading}</w:tcPr>${content}</w:tc>`
}

function padCells(cells: MarkdownInline[][], width: number): MarkdownInline[][] {
  const padded = [...cells]
  while (padded.length < width) padded.push([])
  return padded
}

function horizontalRuleXml(): string {
  return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D1D5DB"/></w:pBdr><w:spacing w:before="160" w:after="160"/></w:pPr></w:p>'
}

function inlineRunsXml(inlines: MarkdownInline[], style: Omit<InlineRun, 'text'> = {}): string {
  return inlines.map((inline) => inlineRunXml(inline, style)).join('')
}

function inlineRunXml(inline: MarkdownInline, style: Omit<InlineRun, 'text'>): string {
  if (inline.type === 'text') return runXml(inline.text, style)
  if (inline.type === 'code') return runXml(inline.text, { ...style, code: true })
  if (inline.type === 'strong') return inlineRunsXml(inline.children, { ...style, bold: true })
  if (inline.type === 'emphasis') return inlineRunsXml(inline.children, { ...style, italic: true })
  if (inline.type === 'link') {
    const children =
      inline.children.length > 0
        ? inline.children
        : ([{ type: 'text', text: inline.url }] satisfies MarkdownInline[])
    return inlineRunsXml(children, { ...style, link: true })
  }
  return runXml(inline.alt || inline.url, style)
}

function runXml(text: string, style: Omit<InlineRun, 'text'>): string {
  const properties: string[] = []
  if (style.bold) properties.push('<w:b/>')
  if (style.italic) properties.push('<w:i/>')
  if (style.code) {
    properties.push(
      '<w:rFonts w:ascii="Cascadia Mono" w:hAnsi="Cascadia Mono" w:eastAsia="Microsoft YaHei"/>',
    )
  }
  if (style.link) properties.push('<w:color w:val="0563C1"/><w:u w:val="single"/>')
  const rPr = properties.length > 0 ? `<w:rPr>${properties.join('')}</w:rPr>` : ''
  const preserve = needsPreserveSpace(text) ? ' xml:space="preserve"' : ''
  return `<w:r>${rPr}<w:t${preserve}>${escapeXmlText(text)}</w:t></w:r>`
}

function stylesXml(): string {
  return xmlDeclaration(`<w:styles ${wordNamespace}>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>
${headingStyleXml(1, 40)}
${headingStyleXml(2, 32)}
${headingStyleXml(3, 28)}
${headingStyleXml(4, 24)}
${headingStyleXml(5, 22)}
${headingStyleXml(6, 20)}
<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="120"/><w:ind w:left="240"/><w:shd w:fill="F5F5F5"/></w:pPr><w:rPr><w:rFonts w:ascii="Cascadia Mono" w:hAnsi="Cascadia Mono" w:eastAsia="Microsoft YaHei"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="80" w:after="120"/><w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="D1D5DB"/></w:pBdr></w:pPr><w:rPr><w:color w:val="4B5563"/></w:rPr></w:style>
</w:styles>`)
}

function headingStyleXml(level: number, size: number): string {
  return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`
}

function numberingXml(): string {
  return xmlDeclaration(`<w:numbering ${wordNamespace}>
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`)
}

function contentTypesXml(): string {
  return xmlDeclaration(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`)
}

function rootRelationshipsXml(): string {
  return xmlDeclaration(`<Relationships ${relationshipNamespace}>
<Relationship Id="rId1" Type="${packageRelationshipType}/officeDocument" Target="word/document.xml"/>
</Relationships>`)
}

function documentRelationshipsXml(): string {
  return xmlDeclaration(`<Relationships ${relationshipNamespace}>
<Relationship Id="rId1" Type="${officeRelationshipType}/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="${officeRelationshipType}/numbering" Target="numbering.xml"/>
</Relationships>`)
}

function sectionXml(): string {
  return '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
}

function xmlDeclaration(xml: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${xml}`
}

function encodeXml(xml: string): Uint8Array {
  return textEncoder.encode(xml)
}

function needsPreserveSpace(text: string): boolean {
  return text !== text.trim() || text.includes('  ')
}

function escapeXmlText(value: string): string {
  return sanitizeXmlValue(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;')
}

function sanitizeXmlValue(value: string): string {
  let sanitized = ''
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0
    if (isValidXmlCodePoint(codePoint)) {
      sanitized += char
    } else {
      sanitized += '\uFFFD'
    }
  }
  return sanitized
}

function isValidXmlCodePoint(value: number): boolean {
  return (
    value === 0x9 ||
    value === 0xa ||
    value === 0xd ||
    (value >= 0x20 && value <= 0xd7ff) ||
    (value >= 0xe000 && value <= 0xfffd) ||
    (value >= 0x10000 && value <= 0x10ffff)
  )
}

function createZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  const { date, time } = dosDateTime(new Date())
  let offset = 0

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name)
    const crc = crc32(entry.data)
    const localHeader = localFileHeader(nameBytes, entry.data.length, crc, time, date)
    localParts.push(localHeader, entry.data)
    centralParts.push(centralDirectoryHeader(nameBytes, entry.data.length, crc, time, date, offset))
    offset += localHeader.length + entry.data.length
  }

  const centralOffset = offset
  const centralSize = sumLengths(centralParts)
  const endRecord = endOfCentralDirectory(entries.length, centralSize, centralOffset)

  return concatBytes([...localParts, ...centralParts, endRecord])
}

function localFileHeader(
  nameBytes: Uint8Array,
  size: number,
  crc: number,
  time: number,
  date: number,
): Uint8Array {
  const header = new Uint8Array(30 + nameBytes.length)
  const view = new DataView(header.buffer)
  setUint32(view, 0, 0x04034b50)
  setUint16(view, 4, 20)
  setUint16(view, 6, 0x0800)
  setUint16(view, 8, 0)
  setUint16(view, 10, time)
  setUint16(view, 12, date)
  setUint32(view, 14, crc)
  setUint32(view, 18, size)
  setUint32(view, 22, size)
  setUint16(view, 26, nameBytes.length)
  setUint16(view, 28, 0)
  header.set(nameBytes, 30)
  return header
}

function centralDirectoryHeader(
  nameBytes: Uint8Array,
  size: number,
  crc: number,
  time: number,
  date: number,
  localOffset: number,
): Uint8Array {
  const header = new Uint8Array(46 + nameBytes.length)
  const view = new DataView(header.buffer)
  setUint32(view, 0, 0x02014b50)
  setUint16(view, 4, 20)
  setUint16(view, 6, 20)
  setUint16(view, 8, 0x0800)
  setUint16(view, 10, 0)
  setUint16(view, 12, time)
  setUint16(view, 14, date)
  setUint32(view, 16, crc)
  setUint32(view, 20, size)
  setUint32(view, 24, size)
  setUint16(view, 28, nameBytes.length)
  setUint16(view, 30, 0)
  setUint16(view, 32, 0)
  setUint16(view, 34, 0)
  setUint16(view, 36, 0)
  setUint32(view, 38, 0)
  setUint32(view, 42, localOffset)
  header.set(nameBytes, 46)
  return header
}

function endOfCentralDirectory(
  entryCount: number,
  centralSize: number,
  centralOffset: number,
): Uint8Array {
  const record = new Uint8Array(22)
  const view = new DataView(record.buffer)
  setUint32(view, 0, 0x06054b50)
  setUint16(view, 4, 0)
  setUint16(view, 6, 0)
  setUint16(view, 8, entryCount)
  setUint16(view, 10, entryCount)
  setUint32(view, 12, centralSize)
  setUint32(view, 16, centralOffset)
  setUint16(view, 20, 0)
  return record
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = sumLengths(parts)
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function sumLengths(parts: Uint8Array[]): number {
  return parts.reduce((total, part) => total + part.length, 0)
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createCrc32Table(): number[] {
  const table: number[] = []
  for (let index = 0; index < 256; index += 1) {
    let crc = index
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
    table.push(crc >>> 0)
  }
  return table
}

function dosDateTime(value: Date): { date: number; time: number } {
  const year = Math.max(value.getFullYear(), 1980)
  const date = ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate()
  const time = (value.getHours() << 11) | (value.getMinutes() << 5) | (value.getSeconds() >> 1)
  return { date, time }
}

function setUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true)
}

function setUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true)
}
