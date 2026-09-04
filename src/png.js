// 纯 Node 生成 PNG（不依赖任何图片库）
// 用途：生成公众号封面占位图。PNG = signature + IHDR + IDAT(zlib) + IEND
import { deflateSync, crc32 } from 'node:zlib'

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcInput = Buffer.concat([typeBuf, data])
  const crcBuf = Buffer.alloc(4)
  // >>> 0 保证无符号 32 位
  crcBuf.writeUInt32BE(crc32(crcInput) >>> 0, 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

// 生成一张垂直渐变 PNG（RGB，8bit）
export function generateGradientPng(width, height, topColor, bottomColor) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // 位深度
  ihdr[9] = 2   // 颜色类型：RGB
  ihdr[10] = 0  // 压缩：deflate
  ihdr[11] = 0  // 滤镜：自适应
  ihdr[12] = 0  // 无隔行扫描

  const rowLen = 1 + width * 3 // 每行：1 字节 filter + width*3 字节 RGB
  const raw = Buffer.alloc(rowLen * height)
  for (let y = 0; y < height; y++) {
    const t = height === 1 ? 0 : y / (height - 1)
    const r = Math.round(topColor[0] + (bottomColor[0] - topColor[0]) * t)
    const g = Math.round(topColor[1] + (bottomColor[1] - topColor[1]) * t)
    const b = Math.round(topColor[2] + (bottomColor[2] - topColor[2]) * t)
    raw[y * rowLen] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const off = y * rowLen + 1 + x * 3
      raw[off] = r
      raw[off + 1] = g
      raw[off + 2] = b
    }
  }
  const idat = deflateSync(raw)

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ])
}
