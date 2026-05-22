import { parseMarkdown } from '@electron/services/export/markdown.js'
import {
  contentTypesXml,
  documentRelationshipsXml,
  documentXml,
  encodeXml,
  numberingXml,
  rootRelationshipsXml,
  stylesXml,
} from '@electron/services/export/docxXml.js'
import { createZip } from '@electron/services/export/docxZip.js'

export const renderDocx = (markdown: string): Uint8Array => {
  return createZip([
    { name: '[Content_Types].xml', data: encodeXml(contentTypesXml()) },
    { name: '_rels/.rels', data: encodeXml(rootRelationshipsXml()) },
    { name: 'word/_rels/document.xml.rels', data: encodeXml(documentRelationshipsXml()) },
    { name: 'word/document.xml', data: encodeXml(documentXml(parseMarkdown(markdown))) },
    { name: 'word/styles.xml', data: encodeXml(stylesXml()) },
    { name: 'word/numbering.xml', data: encodeXml(numberingXml()) },
  ])
}
