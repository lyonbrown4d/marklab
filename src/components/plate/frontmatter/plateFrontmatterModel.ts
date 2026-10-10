import { isMap, isScalar, isSeq, parseDocument, stringify } from 'yaml'

export type FrontmatterFieldKind = 'boolean' | 'date' | 'link' | 'list' | 'scalar' | 'tag' | 'tags'

type FrontmatterBaseField = {
  key: string
}

export type FrontmatterField =
  | (FrontmatterBaseField & {
      kind: 'boolean'
      value: boolean
    })
  | (FrontmatterBaseField & {
      kind: 'date' | 'link' | 'scalar' | 'tag'
      value: string
      valueType: 'number' | 'string'
    })
  | (FrontmatterBaseField & {
      kind: 'list' | 'tags'
      value: string[]
    })

export type FrontmatterModel = {
  error: string | null
  fields: FrontmatterField[]
  unsupportedCount: number
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const linkKeyPattern = /^(?:link|url|uri|website|homepage|source)$/i
const tagKeyPattern = /^tags?$/i
const linkValuePattern = /^(?:(?:https?|mailto|tel):|\[\[|(?:\.\.?\/)?[^\s]+\.md(?:#|$))/i

const isDateValue = (value: string) => {
  if (!datePattern.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

const scalarKind = (key: string, value: string): FrontmatterFieldKind => {
  if (isDateValue(value)) return 'date'
  if (tagKeyPattern.test(key)) return 'tag'
  if (linkKeyPattern.test(key) || linkValuePattern.test(value)) return 'link'
  return 'scalar'
}

export const parseFrontmatter = (source: string): FrontmatterModel => {
  const document = parseDocument(source, { keepSourceTokens: true, uniqueKeys: true })
  if (document.errors.length > 0) {
    return { error: document.errors[0]?.message ?? 'Invalid YAML', fields: [], unsupportedCount: 0 }
  }
  if (!isMap(document.contents)) {
    return { error: 'Frontmatter must be a YAML mapping.', fields: [], unsupportedCount: 0 }
  }

  const fields: FrontmatterField[] = []
  let unsupportedCount = 0
  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string' || !pair.value) {
      unsupportedCount += 1
      continue
    }
    const key = pair.key.value
    const value = pair.value
    if (
      isScalar(value) &&
      value.type !== 'BLOCK_FOLDED' &&
      value.type !== 'BLOCK_LITERAL' &&
      !value.anchor &&
      !value.tag &&
      value.range
    ) {
      if (typeof value.value === 'boolean') {
        fields.push({ key, kind: 'boolean', value: value.value })
        continue
      }
      if (typeof value.value === 'string' || typeof value.value === 'number') {
        const stringValue = String(value.value)
        fields.push({
          key,
          kind: scalarKind(key, stringValue) as 'date' | 'link' | 'scalar' | 'tag',
          value: stringValue,
          valueType: typeof value.value === 'number' ? 'number' : 'string',
        })
        continue
      }
    }
    if (
      isSeq(value) &&
      value.range &&
      value.items.every(
        (item) =>
          isScalar(item) &&
          typeof item.value === 'string' &&
          !item.anchor &&
          !item.tag &&
          Boolean(item.range),
      )
    ) {
      fields.push({
        key,
        kind: tagKeyPattern.test(key) ? 'tags' : 'list',
        value: value.items.map((item) => String(isScalar(item) ? item.value : '')),
      })
      continue
    }
    unsupportedCount += 1
  }

  return { error: null, fields, unsupportedCount }
}

const renderScalar = (field: FrontmatterField, nextValue: string | boolean | string[]) => {
  if (field.kind === 'boolean') return nextValue === true ? 'true' : 'false'
  if (field.kind === 'list' || field.kind === 'tags') return null
  if (!('valueType' in field)) return null
  const value = String(nextValue)
  if (field.valueType === 'number' && /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) {
    return value.trim()
  }
  return stringify(value).trimEnd()
}

const renderSequence = (values: string[], flow: boolean, indentation: string) => {
  if (values.length === 0) return '[]'
  const rendered = stringify(values, flow ? { collectionStyle: 'flow' } : undefined).trimEnd()
  return rendered.replaceAll('\n', `\n${indentation}`)
}

export const updateFrontmatterField = (
  source: string,
  field: FrontmatterField,
  nextValue: string | boolean | string[],
): string => {
  const document = parseDocument(source, { keepSourceTokens: true, uniqueKeys: true })
  if (document.errors.length > 0 || !isMap(document.contents)) return source
  const pair = document.contents.items.find(
    (item) => isScalar(item.key) && item.key.value === field.key,
  )
  const value = pair?.value
  if (!value?.range) return source

  let replacement: string | null
  if ((field.kind === 'list' || field.kind === 'tags') && isSeq(value)) {
    const lineStart = source.lastIndexOf('\n', value.range[0] - 1) + 1
    const indentation = source.slice(lineStart, value.range[0])
    const original = source.slice(value.range[0], value.range[1])
    const trailingLineBreak = original.endsWith('\r\n')
      ? '\r\n'
      : original.endsWith('\n')
        ? '\n'
        : ''
    replacement =
      renderSequence(Array.isArray(nextValue) ? nextValue : [], Boolean(value.flow), indentation) +
      trailingLineBreak
  } else {
    replacement = renderScalar(field, nextValue)
  }
  if (replacement === null) return source
  return source.slice(0, value.range[0]) + replacement + source.slice(value.range[1])
}
