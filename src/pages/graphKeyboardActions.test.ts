import { describe, expect, it } from 'vitest'
import { isTextEditingTarget } from '@/pages/graphKeyboardActions'

describe('graph text editing targets', () => {
  it.each(['', 'true', 'plaintext-only'])(
    'recognizes contenteditable=%s and its descendants',
    (value) => {
      const editor = document.createElement('div')
      editor.setAttribute('contenteditable', value)
      const child = document.createElement('span')
      editor.append(child)
      expect(isTextEditingTarget(child)).toBe(true)
      expect(isTextEditingTarget(child.appendChild(document.createTextNode('text')))).toBe(true)
    },
  )

  it.each(['input', 'textarea', 'select'])('recognizes %s', (tag) => {
    expect(isTextEditingTarget(document.createElement(tag))).toBe(true)
  })

  it('does not treat a plain canvas or explicitly noneditable element as text editing', () => {
    const element = document.createElement('div')
    expect(isTextEditingTarget(element)).toBe(false)
    element.setAttribute('contenteditable', 'false')
    expect(isTextEditingTarget(element)).toBe(false)
    expect(isTextEditingTarget(null)).toBe(false)
  })
})
