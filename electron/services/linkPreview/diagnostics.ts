export type LinkPreviewFailureStage =
  'capture' | 'capture-page' | 'encode' | 'load' | 'parse' | 'request' | 'settle' | 'validate'

export class LinkPreviewOperationError extends Error {
  constructor(
    readonly errorCode: string,
    readonly stage: LinkPreviewFailureStage,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'LinkPreviewOperationError'
  }
}

export const linkPreviewFailureFields = (
  error: unknown,
  fallback: { errorCode: string; stage: LinkPreviewFailureStage },
) => {
  if (error instanceof LinkPreviewOperationError) {
    return { errorCode: error.errorCode, stage: error.stage }
  }
  return fallback
}

export const runLinkPreviewStage = async <T>(
  stage: LinkPreviewFailureStage,
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    const reason = error instanceof Error && error.message ? error.message : 'Unknown error'
    throw new LinkPreviewOperationError(
      `ERR_LINK_PREVIEW_${stage.replace('-', '_').toUpperCase()}`,
      stage,
      `Link preview failed during ${stage}: ${reason}`,
      { cause: error },
    )
  }
}
