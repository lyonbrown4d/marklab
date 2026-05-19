import { Toaster as Sonner, type ToasterProps } from 'sonner'

const toastOptions = {
  classNames: {
    toast:
      'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
    description: 'group-[.toast]:text-muted-foreground',
    actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
    cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
  },
} satisfies ToasterProps['toastOptions']

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      toastOptions={toastOptions}
      {...props}
    />
  )
}

export { Toaster }
