import type { MarkdownBlock, MarkdownInline } from './markdown.js'

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

const wordNamespace = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const relationshipNamespace = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"'
const officeRelationshipType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const packageRelationshipType = 'http://schemas.openxmlformats.org/package/2006/relationships'
const textEncoder = new TextEncoder()

export const documentXml = (blocks: MarkdownBlock[]): string => {
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

export const contentTypesXml = (): string => {
  return xmlDeclaration(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`)
}

export const rootRelationshipsXml = (): string => {
  return xmlDeclaration(`<Relationships ${relationshipNamespace}>
<Relationship Id="rId1" Type="${packageRelationshipType}/officeDocument" Target="word/document.xml"/>
</Relationships>`)
}

export const documentRelationshipsXml = (): string => {
  return xmlDeclaration(`<Relationships ${relationshipNamespace}>
<Relationship Id="rId1" Type="${officeRelationshipType}/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="${officeRelationshipType}/numbering" Target="numbering.xml"/>
</Relationships>`)
}

export const stylesXml = (): string => {
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

export const numberingXml = (): string => {
  return xmlDeclaration(`<w:numbering ${wordNamespace}>
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`)
}

export const encodeXml = (xml: string): Uint8Array => {
  return textEncoder.encode(xml)
}

const blockXml = (
  block: MarkdownBlock,
  quote: boolean,
  usedTitle: boolean,
): { xml: string; usedTitle: boolean } => {
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

  if (block.type === 'codeBlock') return { xml: codeBlockXml(block.text), usedTitle }

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

  if (block.type === 'thematicBreak') return { xml: horizontalRuleXml(), usedTitle }
  return { xml: tableXml(block), usedTitle }
}

const paragraphXml = (runsXml: string, options: ParagraphOptions = {}): string => {
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

const codeBlockXml = (text: string): string => {
  const lines = text.split('\n')
  const runs = (lines.length > 0 ? lines : [''])
    .map((line, index) => `${index > 0 ? '<w:r><w:br/></w:r>' : ''}${runXml(line, { code: true })}`)
    .join('')
  return paragraphXml(runs, { style: 'CodeBlock' })
}

const tableXml = (block: Extract<MarkdownBlock, { type: 'table' }>): string => {
  const width = Math.max(block.header.length, ...block.rows.map((row) => row.length))
  const rows = [
    tableRowXml(padCells(block.header, width), true),
    ...block.rows.map((row) => tableRowXml(padCells(row, width), false)),
  ].join('')

  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:left w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`
}

const tableRowXml = (cells: MarkdownInline[][], header: boolean): string => {
  return `<w:tr>${cells.map((cell) => tableCellXml(cell, header)).join('')}</w:tr>`
}

const tableCellXml = (inlines: MarkdownInline[], header: boolean): string => {
  const shading = header ? '<w:shd w:fill="F3F4F6"/>' : ''
  const content = paragraphXml(inlineRunsXml(inlines, header ? { bold: true } : {}))
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${shading}</w:tcPr>${content}</w:tc>`
}

const padCells = (cells: MarkdownInline[][], width: number): MarkdownInline[][] => {
  const padded = [...cells]
  while (padded.length < width) padded.push([])
  return padded
}

const horizontalRuleXml = (): string => {
  return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D1D5DB"/></w:pBdr><w:spacing w:before="160" w:after="160"/></w:pPr></w:p>'
}

const inlineRunsXml = (inlines: MarkdownInline[], style: Omit<InlineRun, 'text'> = {}): string => {
  return inlines.map((inline) => inlineRunXml(inline, style)).join('')
}

const inlineRunXml = (inline: MarkdownInline, style: Omit<InlineRun, 'text'>): string => {
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

const runXml = (text: string, style: Omit<InlineRun, 'text'>): string => {
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

const headingStyleXml = (level: number, size: number): string => {
  return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`
}

const sectionXml = (): string => {
  return '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
}

const xmlDeclaration = (xml: string): string => {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${xml}`
}

const needsPreserveSpace = (text: string): boolean => {
  return text !== text.trim() || text.includes('  ')
}

const escapeXmlText = (value: string): string => {
  return sanitizeXmlValue(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const escapeXmlAttribute = (value: string): string => {
  return escapeXmlText(value).replace(/"/g, '&quot;')
}

const sanitizeXmlValue = (value: string): string => {
  let sanitized = ''
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0
    sanitized += isValidXmlCodePoint(codePoint) ? char : '\uFFFD'
  }
  return sanitized
}

const isValidXmlCodePoint = (value: number): boolean => {
  return (
    value === 0x9 ||
    value === 0xa ||
    value === 0xd ||
    (value >= 0x20 && value <= 0xd7ff) ||
    (value >= 0xe000 && value <= 0xfffd) ||
    (value >= 0x10000 && value <= 0x10ffff)
  )
}
