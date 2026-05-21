type ZipEntry = {
  name: string
  data: Uint8Array
}

const textEncoder = new TextEncoder()

const createCrc32Table = (): number[] => {
  const table: number[] = []
  for (let index = 0; index < 256; index += 1) {
    let crc = index
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
    table.push(crc >>> 0)
  }
  return table
}

const crcTable = createCrc32Table()

export const createZip = (entries: ZipEntry[]): Uint8Array => {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  const { date, time } = dosDateTime(new Date())
  let offset = 0

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name)
    const crc = crc32(entry.data)
    const localHeader = localFileHeader(nameBytes, entry.data.length, crc, time, date)
    localParts.push(localHeader, entry.data)
    centralParts.push(centralDirectoryHeader(nameBytes, entry.data.length, crc, time, date, offset))
    offset += localHeader.length + entry.data.length
  }

  const centralOffset = offset
  const centralSize = sumLengths(centralParts)
  const endRecord = endOfCentralDirectory(entries.length, centralSize, centralOffset)

  return concatBytes([...localParts, ...centralParts, endRecord])
}

const localFileHeader = (
  nameBytes: Uint8Array,
  size: number,
  crc: number,
  time: number,
  date: number,
): Uint8Array => {
  const header = new Uint8Array(30 + nameBytes.length)
  const view = new DataView(header.buffer)
  setUint32(view, 0, 0x04034b50)
  setUint16(view, 4, 20)
  setUint16(view, 6, 0x0800)
  setUint16(view, 8, 0)
  setUint16(view, 10, time)
  setUint16(view, 12, date)
  setUint32(view, 14, crc)
  setUint32(view, 18, size)
  setUint32(view, 22, size)
  setUint16(view, 26, nameBytes.length)
  setUint16(view, 28, 0)
  header.set(nameBytes, 30)
  return header
}

const centralDirectoryHeader = (
  nameBytes: Uint8Array,
  size: number,
  crc: number,
  time: number,
  date: number,
  localOffset: number,
): Uint8Array => {
  const header = new Uint8Array(46 + nameBytes.length)
  const view = new DataView(header.buffer)
  setUint32(view, 0, 0x02014b50)
  setUint16(view, 4, 20)
  setUint16(view, 6, 20)
  setUint16(view, 8, 0x0800)
  setUint16(view, 10, 0)
  setUint16(view, 12, time)
  setUint16(view, 14, date)
  setUint32(view, 16, crc)
  setUint32(view, 20, size)
  setUint32(view, 24, size)
  setUint16(view, 28, nameBytes.length)
  setUint16(view, 30, 0)
  setUint16(view, 32, 0)
  setUint16(view, 34, 0)
  setUint16(view, 36, 0)
  setUint32(view, 38, 0)
  setUint32(view, 42, localOffset)
  header.set(nameBytes, 46)
  return header
}

const endOfCentralDirectory = (
  entryCount: number,
  centralSize: number,
  centralOffset: number,
): Uint8Array => {
  const record = new Uint8Array(22)
  const view = new DataView(record.buffer)
  setUint32(view, 0, 0x06054b50)
  setUint16(view, 4, 0)
  setUint16(view, 6, 0)
  setUint16(view, 8, entryCount)
  setUint16(view, 10, entryCount)
  setUint32(view, 12, centralSize)
  setUint32(view, 16, centralOffset)
  setUint16(view, 20, 0)
  return record
}

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const total = sumLengths(parts)
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

const sumLengths = (parts: Uint8Array[]): number => {
  return parts.reduce((total, part) => total + part.length, 0)
}

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

const dosDateTime = (value: Date): { date: number; time: number } => {
  const year = Math.max(value.getFullYear(), 1980)
  const date = ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate()
  const time = (value.getHours() << 11) | (value.getMinutes() << 5) | (value.getSeconds() >> 1)
  return { date, time }
}

const setUint16 = (view: DataView, offset: number, value: number): void => {
  view.setUint16(offset, value, true)
}

const setUint32 = (view: DataView, offset: number, value: number): void => {
  view.setUint32(offset, value, true)
}
