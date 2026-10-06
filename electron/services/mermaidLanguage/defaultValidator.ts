import type { MermaidValidator } from '@electron/services/mermaidLanguage/types'
import { MermaidValidationWorkerClient } from '@electron/services/mermaidLanguage/validationWorkerClient'

const validationWorker = new MermaidValidationWorkerClient()

export const validateMermaidSyntax: MermaidValidator = async (document, options) => {
  if (!document.text.trim()) return []
  return validationWorker.validate(document, options)
}
