import { describe, expect, it } from 'vitest'
import { formatExportLabel } from '@/components/status-center/statusCenterModel'

describe('formatExportLabel', () => {
  it('formats a cancelled export independently from a failure', () => {
    const t = (key: string) => key
    const label = formatExportLabel(
      {
        id: 'export-1',
        format: 'pdf',
        output_path: 'report.pdf',
        status: 'cancelled',
        updatedAt: 1,
      },
      t,
    )

    expect(label).toBe('statusCenter.exportCancelled')
  })
})
