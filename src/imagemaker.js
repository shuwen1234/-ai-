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

function buildPrompts({ title, weekday, type, body = '', coverText = '', coverConcept = '' }) {
  // 概念海报通用规则：文字为核心、元素服务含义、不套模板、克制印刷质感
  const textRule = '画面中所有文字必须清晰、正确、排版精致，全部使用简体中文，字号大、有合理内边距，绝不允许乱码、错字、裁切或难以辨认'
  const posterRule = '这是一张高级平面概念海报，不是普通插画也不是简单字效：整体要有强烈的概念感、克制的印刷质感、极简有力、有记忆点；只保留最必要、最有含义的元素，元素必须服务于文字含义而非装饰；不套固定模板，配色随主题自由决定但要统一、清晰、有冲击力'

  // 封面主文字：优先用 md 指定的短文案，否则回退到标题
  const mainText = (coverText || title).trim()
  // 视觉概念/关系：优先用 md 指定，否则给一个开放引导
  const concept = coverConcept
    ? `视觉概念：${coverConcept}。`
    : '请理解主题背后的含义、情绪、隐喻与传播张力，自选最准确的视觉关系（连接/扩散/压迫/穿越/托举/撕裂/照亮/分裂/融合/对抗/聚焦/距离/上升/坠落等）来表达。'

  const cover = `设计一张 5:2 横向高级概念海报（公众号头图）。主题：${title}。${concept} 画面核心主文字为「${mainText}」——必须最大、最醒目、居于视觉中心，一眼可读。${posterRule}。${textRule}。`

  const data = extractDataHint(body)
  let inline1
  if (data) {
    // 有真实数据：概念化的数据可视化海报
    inline1 = `设计一张数据可视化概念海报（横向）。用克制有力的图形（柱状/对比块/占比/流向）清晰呈现「${data.metric}」的对比：${data.pairs.join('，')}。每个数据点配对应中文标签与数值，直观易懂、数字准确醒目。${posterRule}。${textRule}。`
  } else {
    inline1 = `设计一张数据可视化概念海报（横向），主题「${type || title}」。用克制有力的图形（对比/趋势/流向/占比）把该主题的核心关系可视化，配简短准确的中文标签，直观易懂。${posterRule}。${textRule}。`
  }

  // 第二张：概念化表达文章的核心矛盾/结论，可含少量关键数据
  const inline2 = `设计一张概念海报式插图（横向），承接文章「${title}」的核心结论或矛盾。用尺度反差、光影或象征元素表达普通人在城市中的选择与代价，画面中以简短中文点出关键结论或关键词，可搭配一两个关键数字。${posterRule}。${textRule}。`

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
export async function ensureImages({ title, weekday, type, body = '', coverText = '', coverConcept = '' }) {
  const paths = cachePaths(weekday)
  const prompts = buildPrompts({ title, weekday, type, body, coverText, coverConcept })
  const out = {}

  // 封面 5:2 横向概念海报；文内图横向
  const jobs = [
    ['cover', prompts.cover, '1536x614'],
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
