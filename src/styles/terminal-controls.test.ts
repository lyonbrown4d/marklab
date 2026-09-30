// @ts-expect-error Vitest executes this style contract test in Node.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readStyle = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string

const terminalStyles = readStyle('./app/_terminal.scss')

describe('terminal dock styles', () => {
  it('does not retain the removed floating terminal trigger', () => {
    expect(terminalStyles).not.toContain('.terminal-dock-trigger')
    expect(terminalStyles).not.toContain('.terminal-dock-key')
  })
})
