import { describe, expect, it } from 'vitest'
import { sanitizeMonacoVimStatus } from '@/components/vim/monacoVimStatusSanitizer'

describe('Monaco Vim status DOM sanitizer', () => {
  it('keeps command/search inputs while removing executable content and external resources', () => {
    const fragment = document.createDocumentFragment()
    const prompt = document.createElement('span')
    prompt.innerHTML =
      ':<input type="text" spellcheck="false" onfocus="alert(1)"><script>alert(1)</script><img src="https://example.com/leak" onerror="alert(1)">'
    prompt.setAttribute('style', 'position:fixed;inset:0')
    fragment.append(prompt)
    const output = sanitizeMonacoVimStatus(fragment)
    const container = document.createElement('div')
    container.append(output)
    expect(container).toHaveTextContent(':')
    expect(container.querySelector('input')).toHaveAttribute('type', 'text')
    expect(container.querySelector('input')).toHaveAttribute('spellcheck', 'false')
    expect(container.querySelector('input')).not.toHaveAttribute('onfocus')
    expect(container.querySelector('span')).not.toHaveAttribute('style')
    expect(container.querySelector('script, img')).toBeNull()
    expect(container).not.toHaveTextContent('alert(1)')
  })

  it('preserves literal errors without interpreting HTML-like command text', () => {
    const message = document.createTextNode('Unknown command: <img src=x onerror=alert(1)>')
    const container = document.createElement('div')
    container.append(sanitizeMonacoVimStatus(message))
    expect(container).toHaveTextContent('Unknown command: <img src=x onerror=alert(1)>')
    expect(container.querySelector('img')).toBeNull()
  })
})
