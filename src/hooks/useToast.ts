type ToastVariant = 'success' | 'error' | 'info'

export const useToast = () => {
  return (message: string, _variant: ToastVariant = 'info') => {
    void _variant
    console.log(message)
  }
}
