// 封面上传 + 草稿创建 + 定时发布（蓝色数据风）
// 流程（每篇）：
//   1) ensureImages         → 生成/复用 封面 + 2 张文内图（base64）
//   2) uploadPermanentImage → 封面进永久素材，得 thumb_media_id
//   3) uploadInlineImage    → 2 张文内图各上传一次，得外链 url
//   4) markdownToWxHtml     → 带 hero 卡 + 文内 figure，渲染富文本
//   5) draft/add            → 带 thumb_media_id 建草稿
//
// CLI:
//   node src/publish.js --upload-week           上传本周全部
//   node src/publish.js --upload-week --rebuild 强制删旧草稿+重生成图片+重建
//   node src/publish.js --only 周二             只处理某天
//   node src/publish.js --list-drafts           查草稿箱
//   node src/publish.js --status                本地状态

import 'dotenv/config'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { getAccessToken } from './token.js'
import { markdownToWxHtml, parseFrontmatter, buildHero } from './markdown.js'
import {
  ensureImages, uploadPermanentImage, uploadInlineImage,
  dataUriToBuffer, clearImageCache
} from './imagemaker.js'

const CONTENT_DIR = resolve(process.cwd(), process.env.CONTENT_DIR || 'content')
const STATE_PATH = resolve(process.cwd(), 'drafts_state.json')
const BASE = 'https://api.weixin.qq.com/cgi-bin'
const AUTHOR = process.env.AUTHOR || '城市生活账本'

// ====== API 调用 ======
async function addDraft({ title, content, thumbMediaId, digest = '', author = AUTHOR }) {
  const token = await getAccessToken()
  const res = await fetch(`${BASE}/draft/add?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      articles: [{
        title, author,
        digest,
        content,
        thumb_media_id: thumbMediaId,
        content_source_url: '',
        need_open_comment: 1,
        only_fans_can_comment: 0
      }]
    })
  })
  const data = await res.json()
  if (data.errcode) throw new Error(`draft/add 失败：[${data.errcode}] ${data.errmsg}`)
  return data.media_id
}

async function deleteDraft(mediaId) {
  const token = await getAccessToken()
  const res = await fetch(`${BASE}/draft/delete?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_id: mediaId })
  })
  return res.json()
}

export async function submitPublish(mediaId) {
  const token = await getAccessToken()
  const res = await fetch(`${BASE}/freepublish/submit?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_id: mediaId })
  })
  const data = await res.json()
  if (data.errcode) throw new Error(`freepublish/submit 失败：[${data.errcode}] ${data.errmsg}`)
  return data.publish_id
}

async function listDrafts(offset = 0, count = 20) {
  const token = await getAccessToken()
  const res = await fetch(`${BASE}/draft/batchget?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offset, count, no_content: 1 })
  })
  return res.json()
}

// ====== 文章加载 ======
// 剥离「## 封面与配图要求」及其后内容——这是给出图/人工用的配置说明，
// 不属于读者可见正文。出图逻辑只读 frontmatter 与正文表格，故剥离不影响配图。
function stripImageSpec(md = '') {
  const idx = md.search(/(\n-{3,}\s*)?\n#{1,6}\s*封面与配图要求/)
  if (idx === -1) return md
  return md.slice(0, idx).replace(/\s+$/, '') + '\n'
}

function loadArticle(filePath) {
  const md = readFileSync(filePath, 'utf8')
  const fm = parseFrontmatter(md)
  const title = fm.title || filePath.split(/[/\\]/).pop().replace(/\.md$/, '')
  const body = md.replace(/^---\n[\s\S]*?\n---\n?/, '')
  // 估算阅读时长
  const chars = (body.match(/[一-龥]/g) || []).length
  const minutes = Math.max(1, Math.round(chars / 400))
  return { title, body, frontmatter: fm, minutes }
}

// ====== 状态文件 ======
function readState() {
  return existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : { uploaded: [] }
}
function writeState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

// ====== 单篇全流程：生成图 + 上传 + 建草稿 ======
async function processArticle(filePath, { rebuild = false } = {}) {
  const { title, body, frontmatter: fm, minutes } = loadArticle(filePath)
  const wd = fm.weekday
  console.log(`\n📝 处理：${wd} ${fm.date} | ${title}`)

  // 0) rebuild 模式：清图片缓存
  if (rebuild) {
    clearImageCache(wd)
  }

  // 1) 生成/复用 3 张图（传入正文+封面文案/概念，供封面做概念海报、插图嵌真实数据）
  const imgs = await ensureImages({
    title: fm.title, weekday: wd, type: fm.type, body,
    coverText: fm.cover_text || '', coverConcept: fm.cover_concept || ''
  })

  // 2) 上传封面 → thumb_media_id
  console.log(`   🖼️  上传封面`)
  const coverBuf = dataUriToBuffer(imgs.cover)
  const thumb = await uploadPermanentImage(coverBuf, `cover-${wd}.png`)
  console.log(`   ✅ thumb_media_id: ${thumb.media_id}`)

  // 3) 上传 2 张文内图 → 外链 url
  console.log(`   🖼️  上传文内图`)
  const fig1Buf = dataUriToBuffer(imgs.inline1)
  const fig1 = await uploadInlineImage(fig1Buf, `inline1-${wd}.png`)
  const fig2Buf = dataUriToBuffer(imgs.inline2)
  const fig2 = await uploadInlineImage(fig2Buf, `inline2-${wd}.png`)
  console.log(`   ✅ 文内图 url 已就绪`)

  // 4) 渲染富文本（hero 卡 + 文内 figure）
  const hero = buildHero({
    title: fm.title, weekday: fm.weekday, date: fm.date,
    type: fm.type, minutes
  })
  const html = markdownToWxHtml(stripImageSpec(body), {
    hero,
    figures: [
      { src: fig1.url, caption: '· 城市之间，差距藏在数据里 ·' },
      { src: fig2.url, caption: '· 每一个选择，都是一本生活账本 ·' }
    ]
  })

  // 5) 删旧草稿（rebuild 模式或已存在）
  const state = readState()
  const existing = state.uploaded.find(u => u.file === filePath.split(/[/\\]/).pop())
  if (existing && existing.media_id) {
    console.log(`   🗑️  删除旧草稿 ${existing.media_id}`)
    await deleteDraft(existing.media_id)
    state.uploaded = state.uploaded.filter(u => u.file !== existing.file)
    writeState(state)
  }

  // 6) 建新草稿
  console.log(`   📤 创建新草稿`)
  const digest = (fm.digest || '').slice(0, 120)
  const draftMediaId = await addDraft({ title, content: html, thumbMediaId: thumb.media_id, digest })
  console.log(`   ✅ 草稿 media_id: ${draftMediaId}`)

  // 7) 写状态
  const fname = filePath.split(/[/\\]/).pop()
  state.uploaded.push({
    file: fname,
    title: fm.title,
    date: fm.date,
    weekday: fm.weekday,
    media_id: draftMediaId,
    thumb_media_id: thumb.media_id,
    thumb_url: thumb.url,
    inline_urls: [fig1.url, fig2.url],
    uploaded_at: new Date().toISOString(),
    published: false
  })
  writeState(state)

  return { weekday: wd, title: fm.title, date: fm.date, media_id: draftMediaId }
}

// ====== 一周全量 ======
export async function uploadWeek({ rebuild = false, only = null } = {}) {
  let files = readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md') && !f.includes('选题'))
    .sort()

  if (only) {
    files = files.filter(f => f.startsWith(only))
    if (!files.length) {
      console.log(`❌ 没找到以「${only}」开头的文章`)
      return
    }
  }

  console.log(`📚 找到 ${files.length} 篇稿件${rebuild ? '（重建模式）' : ''}`)

  const results = []
  for (const f of files) {
    try {
      const r = await processArticle(join(CONTENT_DIR, f), { rebuild })
      results.push(r)
    } catch (e) {
      console.error(`❌ ${f} 处理失败：${e.message}`)
    }
  }

  console.log(`\n📊 本周草稿箱汇总：`)
  for (const r of results) {
    console.log(`   ${r.weekday} ${r.date} | ${r.title} | ${r.media_id}`)
  }
  return results
}

// ====== CLI ======
const args = process.argv.slice(2)
const rebuild = args.includes('--rebuild')
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : null

if (args.includes('--upload-week') || onlyArg) {
  await uploadWeek({ rebuild, only: onlyArg })
} else if (args.includes('--list-drafts')) {
  console.log(JSON.stringify(await listDrafts(0, 20), null, 2))
} else if (args.includes('--status')) {
  const state = readState()
  console.table(state.uploaded.map(u => ({
    日期: u.date, 星期: u.weekday, 标题: u.title, 已发布: u.published ? '是' : '否'
  })))
} else {
  console.log(`用法：
  node src/publish.js --upload-week            本周全部进草稿箱（含封面+文内图）
  node src/publish.js --upload-week --rebuild  删旧草稿+重生成图片+重建
  node src/publish.js --only 周二              只处理某天
  node src/publish.js --only 周二 --rebuild    重建某天
  node src/publish.js --list-drafts            查草稿箱
  node src/publish.js --status                 查本地发布状态
`)
}
