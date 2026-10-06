type ImeKeyboardEvent = Pick<KeyboardEvent, 'isComposing' | 'key'>

export const isImeKeyboardEvent = (event: ImeKeyboardEvent) =>
  event.isComposing || event.key === 'Process'
