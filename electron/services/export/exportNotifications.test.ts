import { beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  instances: [] as Array<{
    click?: () => void
    options: { body: string; title: string }
    show: ReturnType<typeof vi.fn>
  }>,
  supported: vi.fn(() => true),
}))

vi.mock('electron', () => ({
  Notification: class {
    static isSupported = electron.supported
    private readonly instance: (typeof electron.instances)[number]

    constructor(options: { body: string; title: string }) {
      this.instance = { options, show: vi.fn() }
      electron.instances.push(this.instance)
    }

    on(event: string, listener: () => void) {
      if (event === 'click') this.instance.click = listener
      return this
    }

    show() {
      ;(this.instance.show as unknown as () => void)()
    }
  },
}))

import {
  notifyExportFailed,
  notifyExportFinished,
} from '@electron/services/export/exportNotifications'

describe('export notifications', () => {
  beforeEach(() => {
    electron.instances.length = 0
    electron.supported.mockReset()
    electron.supported.mockReturnValue(true)
  })

  it('shows only the output filename and invokes the completion action when clicked', () => {
    const onClick = vi.fn()

    notifyExportFinished('pdf', 'C:/Users/Alice/Private/report.pdf', onClick)

    expect(electron.instances).toHaveLength(1)
    expect(electron.instances[0]?.options.body).toContain('report.pdf')
    expect(electron.instances[0]?.options.body).not.toContain('C:/Users/Alice/Private')
    expect(electron.instances[0]?.show).toHaveBeenCalledOnce()

    electron.instances[0]?.click?.()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not expose a sensitive path from a failure message', () => {
    notifyExportFailed(
      'docx',
      'C:/Users/Alice/Private/report.docx',
      'EACCES: C:/Users/Alice/Private/report.docx',
    )

    expect(electron.instances[0]?.options.body).toContain('report.docx')
    expect(electron.instances[0]?.options.body).not.toContain('C:/Users/Alice/Private')
  })

  it('does not create a notification when the platform does not support it', () => {
    electron.supported.mockReturnValue(false)

    notifyExportFinished('html', '/private/notes/report.html', vi.fn())

    expect(electron.instances).toHaveLength(0)
  })
})
