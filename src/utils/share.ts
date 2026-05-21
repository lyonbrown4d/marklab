export const encode = (text: string) => {
  const utf8 = new TextEncoder().encode(text)
  let binary = ''
  utf8.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}
const isDevelopment = () => {
  return import.meta.env.MODE === 'development'
}
export { isDevelopment }
