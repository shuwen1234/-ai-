#!/usr/bin/env node
// baoyu-skills 图像后端桥接器（backend id: gpt-image-bridge）
// 让 baoyu-cover-image / baoyu-article-illustrator 拼好的 prompt，
// 直接走本项目现有的 gpt-image-2 通道（ai.112102.xyz）出图，无需额外 API key。
//
// 兼容 baoyu-image-gen 的核心 CLI 约定：
//   node scripts/imggen.mjs --prompt "..." --image out.png [--ar 16:9] [--size 1536x1024]
//   node scripts/imggen.mjs --promptfiles system.md content.md --image out.png --ar 2.35:1
//   node scripts/imggen.mjs --batchfile batch.json
//
// 参数：
//   -p, --prompt <text>        直接给 prompt 文本
//   --promptfiles <f...>       从若干文件读取 prompt 并按顺序拼接（空行分隔）
//   --image <path>             输出图片路径（单图模式必填）
//   --ar <ratio>               宽高比 2.35:1|16:9|1:1|4:3|3:2|2:3 等，映射到就近 size
//   --size <WxH>               直接指定尺寸，优先级高于 --ar
//   --batchfile <path>         JSON 批量：{ "tasks": [ { "prompt"|"promptFiles", "image", "ar"?, "size"? } ] }
//   --response-format file|url 默认 file（写盘）；url 仅打印远程地址（本通道通常返回 data URI，回退为写盘）
//   --provider / -m / --quality / --imageSize 等：为兼容而接受，本桥接忽略
//
// 退出码：0 全部成功；1 有任务失败。失败时对封面回退渐变图，保证 skill 流程不断。

import 'dotenv/config'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { generateGradientPng } from '../src/png.js'

const IMG_API_BASE = process.env.IMAGE_API_BASE || 'https://ai.112102.xyz'
const IMG_API_KEY = process.env.IMAGE_API_KEY || 'sk-aKwWp5aBoqTlqp1fyjkrCD8YRAmRkkOU3oCB9L356TMyJUET'
const IMG_MODEL = process.env.IMAGE_MODEL || 'gpt-image-2'
const SIMPLIFIED_CN_HINT = '图中若出现任何文字，必须为简体中文，严禁繁体字。'

// ====== 参数解析（支持 --key value 与 --key v1 v2 ... 多值）======
function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-p' || a === '--prompt') { args.prompt = argv[++i] }
    else if (a === '--promptfiles') {
      args.promptfiles = []
      while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) args.promptfiles.push(argv[++i])
    }
    else if (a === '--image' || a === '-o' || a === '--output') { args.image = argv[++i] }
    else if (a === '--ar') { args.ar = argv[++i] }
    else if (a === '--size') { args.size = argv[++i] }
    else if (a === '--batchfile') { args.batchfile = argv[++i] }
    else if (a === '--response-format') { args.responseFormat = argv[++i] }
    // 兼容 baoyu-image-gen 的其它参数，接受但忽略
    else if (a === '--provider' || a === '-m' || a === '--model' || a === '--quality' ||
             a === '--imageSize' || a === '--imageApiDialect' || a === '--jobs') { i++ }
    else if (a.startsWith('-')) { /* 未知开关，忽略 */ }
    else args._.push(a)
  }
  return args
}

// ====== 宽高比 → gpt-image-2 就近尺寸 ======
// 该通道对横图统一用 1536x1024，竖图 1024x1536，方图 1024x1024。
function arToSize(ar) {
  if (!ar) return '1536x1024'
  const m = String(ar).match(/^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/)
  if (!m) return '1536x1024'
  const w = parseFloat(m[1]), h = parseFloat(m[2])
  if (!w || !h) return '1536x1024'
  const r = w / h
  if (r > 1.15) return '1536x1024'   // 横图（含 2.35:1 / 16:9 / 3:2 / 4:3）
  if (r < 0.87) return '1024x1536'   // 竖图（含 2:3 / 9:16）
  return '1024x1024'                 // 近方图（1:1）
}

// ====== 从模型返回内容里提取图片（data URI / url / markdown）======
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

function dataUriToBuffer(dataUri) {
  const m = String(dataUri).match(/^data:image\/[a-zA-Z+]+;base64,(.+)$/)
  if (m) return Buffer.from(m[1], 'base64')
  return Buffer.from(dataUri, 'base64')
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ====== 单次出图请求（带超时）======
async function attemptGenerate(prompt, { size, wantUrl = false, timeoutMs = 180000 } = {}) {
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

    if (wantUrl && !src.startsWith('data:')) return { url: src }
    if (src.startsWith('data:')) return { buffer: dataUriToBuffer(src) }
    const imgRes = await fetch(src, { signal: ctrl.signal })
    if (!imgRes.ok) throw new Error(`下载生成图失败 HTTP ${imgRes.status}`)
    return { buffer: Buffer.from(await imgRes.arrayBuffer()) }
  } finally {
    clearTimeout(timer)
  }
}

// ====== 调 gpt-image-2 出图（自动重试 + 指数退避），返回 { buffer } 或 { url }======
async function generate(prompt, { size, wantUrl = false, retries = 3 } = {}) {
  let lastErr
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await attemptGenerate(prompt, { size, wantUrl })
    } catch (e) {
      lastErr = e
      if (attempt < retries) {
        const backoff = 3000 * attempt + Math.floor(Math.random() * 1500)
        console.warn(`⏳ 出图第 ${attempt} 次失败(${e.message.slice(0, 60)})，${Math.round(backoff / 1000)}s 后重试`)
        await sleep(backoff)
      }
    }
  }
  throw lastErr
}

function loadPrompt(task) {
  if (task.prompt) return task.prompt
  const files = task.promptfiles || task.promptFiles
  if (files && files.length) {
    return files.map(f => readFileSync(resolve(f), 'utf8').trim()).join('\n\n')
  }
  return null
}

function sizeFor(task) {
  if (task.size) return task.size
  return arToSize(task.ar)
}

// ====== 执行单个出图任务 ======
async function runTask(task, { wantUrl }) {
  const prompt = loadPrompt(task)
  if (!prompt) throw new Error('缺少 prompt（--prompt 或 --promptfiles）')
  const out = task.image
  if (!out && !wantUrl) throw new Error('缺少输出路径 --image')
  const size = sizeFor(task)

  try {
    const r = await generate(prompt, { size, wantUrl })
    if (wantUrl && r.url) {
      process.stdout.write(r.url + '\n')
      return { ok: true, url: r.url }
    }
    mkdirSync(dirname(resolve(out)), { recursive: true })
    writeFileSync(resolve(out), r.buffer)
    console.log(`✅ ${out}  (${size})`)
    return { ok: true, image: out }
  } catch (e) {
    // 回退：写一张蓝色渐变占位图，保证 skill 流程不中断
    console.warn(`⚠️  生成失败(${e.message})，回退渐变占位图`)
    const [w, h] = size.split('x').map(Number)
    const buf = generateGradientPng(w || 1536, h || 1024, [47, 111, 235], [13, 43, 82])
    mkdirSync(dirname(resolve(out)), { recursive: true })
    writeFileSync(resolve(out), buf)
    console.log(`✅ ${out}  (${size}, 渐变回退)`)
    return { ok: false, image: out, error: e.message }
  }
}

// ====== main ======
const args = parseArgs(process.argv.slice(2))
const wantUrl = args.responseFormat === 'url'

let tasks = []
if (args.batchfile) {
  const spec = JSON.parse(readFileSync(resolve(args.batchfile), 'utf8'))
  tasks = spec.tasks || spec
} else {
  tasks = [{ prompt: args.prompt, promptfiles: args.promptfiles, image: args.image, ar: args.ar, size: args.size }]
}

let anyFail = false
for (const t of tasks) {
  const r = await runTask(t, { wantUrl })
  if (!r.ok) anyFail = true
}
process.exit(anyFail ? 1 : 0)
