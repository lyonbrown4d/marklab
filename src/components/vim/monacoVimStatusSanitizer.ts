import DOMPurify from 'dompurify'

// Monaco Vim owns its prompt DOM. Keep its text/input markup while dropping
// executable content, external resources, and inline vendor styling.
export const sanitizeMonacoVimStatus = (node: Node): Node => {
  const container = document.createElement('div')
  container.append(node.cloneNode(true))
  return DOMPurify.sanitize(container.innerHTML, {
    ALLOWED_TAGS: ['span', 'input'],
    ALLOWED_ATTR: [
      'type',
      'value',
      'autocorrect',
      'autocapitalize',
      'autocomplete',
      'spellcheck',
      'aria-label',
    ],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  })
}
