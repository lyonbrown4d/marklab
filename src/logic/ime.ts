type ImeKeyboardEvent = Pick<KeyboardEvent, 'isComposing' | 'keyCode'>

export const isImeKeyboardEvent = (event: ImeKeyboardEvent) =>
  event.isComposing || event.keyCode === 229
