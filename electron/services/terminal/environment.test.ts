import { describe, expect, it } from 'vitest'
import { buildTerminalEnvironment } from '@electron/services/terminal/environment'

describe('buildTerminalEnvironment', () => {
  it('adds terminal capabilities and a macOS UTF-8 locale fallback', () => {
    expect(buildTerminalEnvironment({}, 'darwin')).toMatchObject({
      COLORTERM: 'truecolor',
      LC_CTYPE: 'en_US.UTF-8',
      TERM: 'xterm-256color',
      TERM_PROGRAM: 'Marklab',
    })
  })

  it('preserves an existing UTF-8 locale and terminal metadata', () => {
    const environment = buildTerminalEnvironment(
      {
        COLORTERM: '24bit',
        LANG: 'zh_CN.UTF-8',
        TERM: 'screen-256color',
        TERM_PROGRAM: 'CustomTerminal',
      },
      'linux',
    )

    expect(environment).toMatchObject({
      COLORTERM: '24bit',
      LANG: 'zh_CN.UTF-8',
      TERM: 'screen-256color',
      TERM_PROGRAM: 'CustomTerminal',
    })
    expect(environment.LC_CTYPE).toBeUndefined()
  })

  it('does not inject POSIX locale variables into Windows shells', () => {
    expect(buildTerminalEnvironment({}, 'win32').LC_CTYPE).toBeUndefined()
  })
})
