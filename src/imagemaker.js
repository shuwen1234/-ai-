// AI 配图：封面 + 2 张文内图（gpt-image-2）+ 本地缓存 + 微信素材上传
// 复用 image-generator 的接口（ai.112102.xyz，模型 gpt-image-2）。
//
// 对外接口（publish.js 依赖，签名不可变）：
//   ensureImages({ title, weekday, type }) -> { cover, inline1, inline2 }  （data URI）
//   uploadPermanentImage(buffer, filename) -> { media_id, url }            （永久素材，封面用）
//   uploadInlineImage(buffer, filename)    -> { url }                      （正文内嵌图）
//   dataUriToBuffer(dataUri)               -> Buffer
//   clearImageCache(weekday)               -> void
//
// 稳健性：AI 生成失败时回退到本地蓝色渐变封面（cover.js），保证发布流程不中断。
// 视觉：简约大气蓝色基调 + 数据信息图质感（图表、地图、账本、城市天际线）。

import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { getAccessToken } from './token.js'
import { generateCover } from './cover.js'
import { generateGradientPng } from './png.js'

const IMAGES_DIR = resolve(process.cwd(), 'images')
const BASE = 'https://api.weixin.qq.com/cgi-bin'

// 图片生成 API（可用 .env 覆盖，否则用 image-generator 里的默认值）
const IMG_API_BASE = process.env.IMAGE_API_BASE || 'https://ai.112102.xyz'
const IMG_API_KEY = process.env.IMAGE_API_KEY || 'sk-aKwWp5aBoqTlqp1fyjkrCD8YRAmRkkOU3oCB9L356TMyJUET'
const IMG_MODEL = process.env.IMAGE_MODEL || 'gpt-image-2'

const SIMPLIFIED_CN_HINT = '图中若出现任何文字，必须为简体中文，严禁繁体字。'

if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true })

// ====== data URI <-> Buffer ======
export function dataUriToBuffer(dataUri) {
  const m = String(dataUri).match(/^data:image\/[a-zA-Z+]+;base64,(.+)$/)
  if (m) return Buffer.from(m[1], 'base64')
  return Buffer.from(dataUri, 'base64')
}

function bufferToDataUri(buf, mime = 'image/png') {
  return `data:${mime};base64,${buf.toString('base64')}`
}

// ====== 从模型返回内容里提取图片（data URI / url）======
function extractImage(content) {
  if (!content) return null
  const md = content.match(/!\[[^\]]*\]\(([^)\s]+)\)/)
  if (md) return md[1]
  const data = content.match(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/)
  if (data) return data[0]
  const url = content.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(\?\S*)?/i)
  if (url) return url[0]
  return null
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ====== 单次出图请求（带超时）======
async function attemptGenerate(prompt, { size, timeoutMs = 180000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${IMG_API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${IMG_API_KEY}`
      },
      body: JSON.stringify({
        model: IMG_MODEL,
        messages: [{ role: 'user', content: `${SIMPLIFIED_CN_HINT}\n${prompt}` }],
        size
      }),
      signal: ctrl.signal
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(`图片API HTTP ${res.status} ${t.slice(0, 120)}`)
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content ?? ''
    const src = extractImage(content)
    if (!src) throw new Error('返回内容未找到图片')

    if (src.startsWith('data:')) return dataUriToBuffer(src)
    const imgRes = await fetch(src, { signal: ctrl.signal })
    if (!imgRes.ok) throw new Error(`下载生成图失败 HTTP ${imgRes.status}`)
    return Buffer.from(await imgRes.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

// ====== 调 gpt-image-2 文生图（自动重试 + 指数退避）======
// 上游（gpt-image-2 / Cloudflare）在高负载时常见 524 网关超时、fetch failed，
// 属瞬时故障，退避后重试即可自愈，避免手动重跑。
async function generateAiImage(prompt, { size = '1536x1024', retries = 3 } = {}) {
  let lastErr
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await attemptGenerate(prompt, { size })
    } catch (e) {
      lastErr = e
      if (attempt < retries) {
        const backoff = 3000 * attempt + Math.floor(Math.random() * 1500) // 递增+抖动
        console.warn(`   ⏳ 出图第 ${attempt} 次失败(${e.message.slice(0, 60)})，${Math.round(backoff / 1000)}s 后重试`)
        await sleep(backoff)
      }
    }
  }
  throw lastErr
}

// ====== 按文章信息构造 prompt ======
// 从正文里抽取第一张表格的「标签 → 数值」对，供插图做成真实数据信息图。
// 优先取最后一个数值列作为核心指标；表格无干净数值列（纯文本类）时返回 null，
// 不编造数据（契合数据合规原则）。
function extractDataHint(body = '') {
  const lines = body.split('\n').map(l => l.trim())
  const tableLines = []
  let inTable = false
  for (const l of lines) {
    if (l.startsWith('|') && l.endsWith('|')) { inTable = true; tableLines.push(l) }
    else if (inTable) break
  }
  const rows = tableLines
    .filter(l => !/^\|[\s:-]+\|$/.test(l))
    .map(l => l.slice(1, -1).split('|').map(c => c.trim()))
  if (rows.length < 2) return null
  const header = rows[0]
  const dataRows = rows.slice(1)
  let valCol = -1
  for (let c = header.length - 1; c >= 1; c--) {
    const numeric = dataRows.filter(r => /\d/.test(r[c] || '')).length
    if (numeric >= Math.ceil(dataRows.length * 0.6)) { valCol = c; break }
  }
  if (valCol === -1) return null
  const metric = header[valCol]
  const pairs = dataRows.slice(0, 6).map(r => `${r[0]}：${r[valCol]}`)
  return { metric, pairs }
}

function buildPrompts({ title, weekday, type, body = '' }) {
  // 高级城市插画 + 科技感：现代都市 + 数据可视化 + 未来科技质感
  const style = '高级现代城市插画风格，融入科技感与数据可视化元素：发光的数据流、半透明数据面板、全息投影质感、精致的等距(isometric)城市建筑或城市天际线，主色为深蓝到亮蓝的渐变（藏蓝、钢蓝、青蓝）点缀霓虹青色高光，光影层次丰富，画面干净大气有未来科技氛围，电影级质感'
  const textRule = '画面中的文字必须清晰、正确、排版精致美观，全部使用简体中文，不得出现乱码或错字'

  const cover = `为公众号城市数据类文章设计高级封面插画。以现代都市天际线或等距城市建筑为主体，叠加发光的数据网格、图表与光点，营造科技感与数据洞察氛围。在画面显著位置以精致的现代字体排版嵌入中文主标题「${title}」（可分两行居中或靠上排布，作为封面大标题）。${style}。${textRule}。构图大气，主标题醒目易读。`

  const data = extractDataHint(body)
  let inline1
  if (data) {
    // 有真实数据：做成带中文标签与数值的信息图
    inline1 = `高级城市数据信息图插画：用发光的全息柱状图/数据面板，清晰展示「${data.metric}」的对比数据 —— ${data.pairs.join('，')}。每个数据点都配上对应的中文标签与数值，数字醒目准确。等距现代都市作背景，${style}。${textRule}。`
  } else {
    inline1 = `高级城市数据信息图插画：等距现代都市，多座城市之间由发光的数据线连接，上方悬浮半透明的柱状图与数据面板，并标注「${type || '城市对比'}」等简短中文栏目标签，表现城市之间的对比，${style}。${textRule}。`
  }

  const inline2 = `高级城市插画：一个人站在城市夜景前，面前是发光的全息数据界面，界面上以简短中文文字点明主题「${title}」的关键信息（如关键词或一句话结论），并有房子、硬币、路径等生活选择图标，表现普通人在城市中的决策，科技感与人文氛围兼具，${style}。${textRule}。`

  return { cover, inline1, inline2 }
}

// ====== 缓存路径 ======
function cachePaths(weekday) {
  return {
    cover: join(IMAGES_DIR, `${weekday}-cover.png`),
    inline1: join(IMAGES_DIR, `${weekday}-inline1.png`),
    inline2: join(IMAGES_DIR, `${weekday}-inline2.png`)
  }
}

export function clearImageCache(weekday) {
  const p = cachePaths(weekday)
  for (const key of Object.keys(p)) {
    if (existsSync(p[key])) {
      unlinkSync(p[key])
      console.log(`   🗑️  清除缓存 ${key}`)
    }
  }
}

// ====== 生成/复用 3 张图，返回 data URI ======
export async function ensureImages({ title, weekday, type, body = '' }) {
  const paths = cachePaths(weekday)
  const prompts = buildPrompts({ title, weekday, type, body })
  const out = {}

  const jobs = [
    ['cover', prompts.cover, '1536x1024'],
    ['inline1', prompts.inline1, '1536x1024'],
    ['inline2', prompts.inline2, '1536x1024']
  ]

  for (const [key, prompt, size] of jobs) {
    const path = paths[key]
    if (existsSync(path)) {
      out[key] = bufferToDataUri(readFileSync(path))
      continue
    }
    let buf
    try {
      console.log(`   🎨 生成${key === 'cover' ? '封面' : '文内图' + key.slice(-1)} [${weekday}]`)
      buf = await generateAiImage(prompt, { size })
    } catch (e) {
      // 兜底：封面用蓝色配色渐变，文内图用中性蓝渐变，保证流程不断
      console.warn(`   ⚠️  ${key} AI 生成失败(${e.message})，回退渐变图`)
      buf = key === 'cover'
        ? generateCover(weekday)
        : generateGradientPng(1200, 800, [225, 235, 248], [150, 178, 214])
    }
    writeFileSync(path, buf)
    out[key] = bufferToDataUri(buf)
  }

  return out
}

// ====== 上传永久素材（封面用）→ media_id + url ======
export async function uploadPermanentImage(buffer, filename = 'cover.png') {
  const token = await getAccessToken()
  const { body, contentType } = buildMultipart(buffer, filename, { type: 'image' })
  const res = await fetch(`${BASE}/material/add_material?access_token=${token}&type=image`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body
  })
  const data = await res.json()
  if (data.errcode) throw new Error(`add_material 失败：[${data.errcode}] ${data.errmsg}`)
  return { media_id: data.media_id, url: data.url }
}

// ====== 上传正文内嵌图 → url（不占素材库）======
export async function uploadInlineImage(buffer, filename = 'inline.png') {
  const token = await getAccessToken()
  const { body, contentType } = buildMultipart(buffer, filename)
  const res = await fetch(`${BASE}/media/uploadimg?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body
  })
  const data = await res.json()
  if (data.errcode) throw new Error(`uploadimg 失败：[${data.errcode}] ${data.errmsg}`)
  return { url: data.url }
}

// ====== 手工构造 multipart/form-data ======
function buildMultipart(buffer, filename, fields = {}) {
  const boundary = '----FormBoundary' + Math.random().toString(16).slice(2)
  const parts = []
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
    ))
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`
  ))
  parts.push(buffer)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`
  }
}
