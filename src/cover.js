// 封面图生成（纯 Node，无依赖）
// 用途：AI 生成失败时的兜底封面。统一蓝色基调，按星期做深浅区分。
import { generateGradientPng } from './png.js'

// 蓝色系配色 [上, 下]，简约大气，贴合「城市生活账本」数据人设
const PALETTES = {
  周一: [[47, 111, 235], [13, 43, 82]],    // 亮蓝→深藏蓝
  周二: [[31, 78, 140], [13, 43, 82]],     // 靛蓝→深藏蓝
  周三: [[61, 139, 212], [18, 52, 95]],    // 天蓝→深蓝
  周四: [[38, 92, 158], [15, 40, 75]],     // 钢蓝→墨蓝
  周五: [[86, 156, 214], [24, 60, 108]],   // 浅钢蓝→深蓝
  周六: [[52, 120, 190], [16, 45, 88]],    // 海蓝→深蓝
  周日: [[70, 130, 200], [20, 50, 95]]     // 湖蓝→深蓝
}

export function generateCover(weekday) {
  const [top, bottom] = PALETTES[weekday] || PALETTES.周一
  return generateGradientPng(900, 500, top, bottom)
}
