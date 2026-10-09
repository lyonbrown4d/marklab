import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskStatusRow } from '@/components/status-center/TaskStatusRow'

const labels = {
  cancel: 'Cancel task',
  open: 'Open output',
  retry: 'Retry task',
  showDetails: 'Show details',
}

describe('TaskStatusRow', () => {
  it('prevents duplicate async actions while one is pending', async () => {
    let resolveAction: (() => void) | undefined
    const onCancel = vi.fn(() => new Promise<void>((resolve) => (resolveAction = resolve)))
    render(
      <TaskStatusRow dotClassName="bg-primary" labels={labels} onCancel={onCancel}>
        Exporting PDF
      </TaskStatusRow>,
    )
    const cancel = screen.getByRole('button', { name: 'Cancel task' })

    fireEvent.click(cancel)
    fireEvent.click(cancel)

    expect(onCancel).toHaveBeenCalledOnce()
    expect(cancel).toBeDisabled()
    resolveAction?.()
    await waitFor(() => expect(cancel).toBeEnabled())
  })

  it('turns action failures into visible task details', async () => {
    render(
      <TaskStatusRow
        dotClassName="bg-destructive"
        labels={labels}
        onRetry={() => Promise.reject(new Error('Index retry failed'))}
      >
        Workspace index
      </TaskStatusRow>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry task' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Index retry failed')
  })

  it('turns synchronous failures into visible task details', async () => {
    render(
      <TaskStatusRow
        dotClassName="bg-destructive"
        labels={labels}
        onRetry={() => {
          throw new Error('Synchronous failure')
        }}
      >
        Workspace index
      </TaskStatusRow>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry task' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Synchronous failure')
  })
})
