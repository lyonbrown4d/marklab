import { useRef, useState, type RefObject } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

type ConfirmDestructiveActionDialogProps = {
  open: boolean
  title: string
  description: string
  resourceName: string
  confirmLabel: string
  pendingLabel: string
  cancelLabel: string
  error?: string
  returnFocusRef?: RefObject<HTMLElement | null>
  fallbackFocusRef?: RefObject<HTMLElement | null>
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}

export const ConfirmDestructiveActionDialog = ({
  open,
  title,
  description,
  resourceName,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  error,
  returnFocusRef,
  fallbackFocusRef,
  onOpenChange,
  onConfirm,
}: ConfirmDestructiveActionDialogProps) => {
  const [confirming, setConfirming] = useState(false)
  const confirmInFlightRef = useRef(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (confirmInFlightRef.current) return
    onOpenChange(nextOpen)
  }

  const handleConfirm = async () => {
    if (confirmInFlightRef.current) return
    confirmInFlightRef.current = true
    setConfirming(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // The owning mutation exposes its actionable error next to this dialog and row.
    } finally {
      confirmInFlightRef.current = false
      setConfirming(false)
    }
  }

  const handleCloseAutoFocus = (event: Event) => {
    const primaryTarget = returnFocusRef?.current
    const fallbackTarget = fallbackFocusRef?.current
    const target = primaryTarget?.isConnected ? primaryTarget : fallbackTarget
    if (!target?.isConnected) return
    event.preventDefault()
    target.focus()
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent onCloseAutoFocus={handleCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description} <strong className="font-medium text-foreground">{resourceName}</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>{cancelLabel}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={confirming}
            aria-busy={confirming}
            onClick={() => void handleConfirm()}
          >
            {/* AlertDialogAction closes immediately; this controlled async action stays open on failure. */}
            {confirming && <Spinner aria-hidden="true" />}
            {confirming ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
