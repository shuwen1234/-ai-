// Markdown → 微信公众号富文本 HTML（蓝色数据风 · 简约大气）
// 设计：hero 标题卡（深蓝渐变）+ 首段结论前置 + 二级标题带蓝色装饰条
//       + 数据表格（深蓝表头 + 斑马纹）+ 三大固定卡片：
//       （本篇你可以带走 / 数据来源与口径 / 今日互动）+ 文内配图 figure
//
// 关键约束（沿用踩过的坑）：卡片正文接收的是「已渲染的 HTML 片段」，
// 直接注入，禁止再过 inline()/escapeHtml()，否则 <p> 会变 &lt;p&gt; 显示成源码。
//
// 账号定位：城市生活账本 —— 用数据看城市，用故事讲普通人的生活选择。

// ====== 配色（简约大气蓝色基调）======
const C = {
  text: '#2b3440',
  textMuted: '#7a8595',
  line: '#e3e9f0',
  accent: '#1f6feb',        // 主蓝（链接/强调）
  accentDark: '#12345f',    // 深藏蓝（标题/表头）
  heroFrom: '#1f4e8c',      // hero 渐变上
  heroTo: '#0d2b52',        // hero 渐变下
  tableHead: '#1f3a5f',     // 表头深蓝
  tableZebra: '#f4f8fd',    // 斑马纹浅蓝
  takeaway: { bg: '#eef4fc', border: '#1f6feb', text: '#12345f' },
  source: { bg: '#f5f7fa', border: '#c3d0e0', tag: '#5a7291', text: '#3d4d63' },
  hudong: { bg: '#e8f2fb', border: '#3d8bd4', text: '#12345f' }
}

// ====== 基础工具 ======
export function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 行内格式：先转义，再处理 **加粗**
function inline(text = '') {
  let s = escapeHtml(text)
  s = s.replace(/\*\*([^*]+)\*\*/g, `<strong style="font-weight:700;color:${C.accentDark};">$1</strong>`)
  return s
}

// ====== frontmatter 解析 ======
export function parseFrontmatter(md = '') {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const fm = {}
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1).trim()
    val = val.replace(/^["']|["']$/g, '')
    fm[key] = val
  }
  return fm
}

// ====== hero 标题卡（深蓝渐变 + 栏目标签）======
export function buildHero({ title, weekday, date, type, minutes }) {
  return `
<section style="margin:0 0 26px;padding:36px 24px;background:${C.accentDark};background:linear-gradient(135deg,${C.heroFrom},${C.heroTo});border-radius:14px;box-shadow:0 8px 26px rgba(13,43,82,0.28);">
  <div style="font-size:12px;letter-spacing:3px;color:rgba(255,255,255,0.82);margin-bottom:14px;">${escapeHtml(weekday || '')} · ${escapeHtml(date || '')}</div>
  <h1 style="margin:0;font-size:24px;line-height:1.5;color:#ffffff;font-weight:800;letter-spacing:0.5px;">${escapeHtml(title || '')}</h1>
  <div style="margin-top:18px;display:inline-block;padding:5px 13px;background:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.25);border-radius:6px;font-size:12px;color:#ffffff;letter-spacing:1px;">${escapeHtml(type || '')} · 约 ${minutes || 3} 分钟</div>
</section>`.trim()
}

// ====== 二级标题（带装饰竖条）======
function h2(titleText) {
  return `
<section style="margin:36px 0 16px;">
  <div style="display:flex;align-items:center;">
    <span style="display:inline-block;width:4px;height:22px;background:${C.accent};border-radius:2px;margin-right:11px;"></span>
    <span style="font-size:19px;font-weight:800;color:${C.accentDark};line-height:1.4;">${inline(titleText)}</span>
  </div>
</section>`.trim()
}

// ====== 普通段落（首段结论加重底纹可选）======
function paragraph(line, { lead = false } = {}) {
  if (lead) {
    // 首段是「200字内的意外结论」，给一个左边框强调块
    return `<p style="margin:0 0 20px;padding:14px 16px;background:${C.takeaway.bg};border-left:4px solid ${C.accent};border-radius:0 8px 8px 0;line-height:1.9;font-size:16px;color:${C.accentDark};font-weight:600;text-align:justify;">${inline(line)}</p>`
  }
  return `<p style="margin:0 0 18px;line-height:1.9;font-size:16px;color:${C.text};text-align:justify;">${inline(line)}</p>`
}

// ====== 引用块 ======
function blockquote(text) {
  return `<section style="margin:16px 0;padding:12px 16px;background:${C.source.bg};border-left:3px solid ${C.line};border-radius:0 8px 8px 0;"><span style="font-size:14px;color:${C.textMuted};line-height:1.8;">${inline(text)}</span></section>`
}

// ====== 列表渲染 ======
function renderList(items, ordered) {
  const tag = ordered ? 'ol' : 'ul'
  const lis = items.map(it =>
    `<li style="margin:0 0 8px;line-height:1.8;font-size:16px;color:${C.text};">${inline(it)}</li>`
  ).join('')
  return `<${tag} style="margin:0 0 18px;padding-left:22px;">${lis}</${tag}>`
}

// takeaway 卡专用有序列表（彩色序号感）
function olList(items, color) {
  const lis = items.map((it, i) =>
    `<li style="margin:0 0 10px;line-height:1.8;font-size:15px;color:${color.text};"><span style="display:inline-block;min-width:20px;font-weight:800;color:${C.accent};">${i + 1}.</span> ${inline(it)}</li>`
  ).join('')
  return `<ul style="margin:0;padding-left:2px;list-style:none;">${lis}</ul>`
}

// 判断是否为「数值型」单元格：含数字，且去掉数字与常见数字修饰后几乎不剩字符。
// 用于给数字列加 nowrap，防止「约 2000」「4800」被折成两行，而长文本列仍可正常换行。
function isNumericCell(s = '') {
  const t = String(s).trim()
  if (!/\d/.test(t)) return false
  const rest = t.replace(/[\d\s.,%：:¥$￥约元万千亿+\-~～/、()（）]|次|人|岁|年|月|天|倍|多/g, '')
  return rest.length <= 1
}

// ====== 表格（深蓝表头 + 斑马纹，响应式自适应）======
// 自适应策略：
//   1) 外层 section 开启 overflow-x:auto —— 列多、太宽时可横向滑动，绝不撑破手机屏幕；
//   2) 数值单元格 white-space:nowrap —— 数字不折行；文本列正常换行；
//   3) 紧凑排版（13px + 小 padding）—— 常见 4~6 列表格在竖屏手机上尽量整屏显示。
function renderTable(rows) {
  const trs = rows.map((row, ri) => {
    const isHead = ri === 0
    if (isHead) {
      const cells = row.map(c =>
        `<th style="padding:10px 11px;font-size:13px;border:1px solid ${C.tableHead};background:${C.tableHead};color:#ffffff;text-align:left;font-weight:700;letter-spacing:0.3px;white-space:nowrap;">${inline(c)}</th>`
      ).join('')
      return `<tr>${cells}</tr>`
    }
    const zebra = ri % 2 === 0 ? C.tableZebra : '#ffffff'
    const cells = row.map((c, ci) => {
      // 第一列略微加重，充当行标签
      const emphasis = ci === 0 ? `color:${C.accentDark};font-weight:600;` : `color:${C.text};`
      // 数值型单元格不换行，保证数字完整显示在一行；文本列允许换行
      const nowrap = isNumericCell(c) ? 'white-space:nowrap;' : 'word-break:break-word;'
      return `<td style="padding:9px 11px;font-size:13px;border:1px solid ${C.line};background:${zebra};${emphasis}${nowrap}">${inline(c)}</td>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  // 滚动容器承载圆角/阴影/外边距；表格本身 width:100% 自适应，超宽时容器横向滚动
  return `<section style="margin:18px 0;overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px;box-shadow:0 2px 10px rgba(31,58,95,0.06);">
<table style="width:100%;border-collapse:collapse;font-size:13px;">${trs}</table>
</section>`
}

// ====== 文内配图 figure（带说明）======
export function figure(src, caption) {
  return `
<section style="margin:24px 0;text-align:center;">
  <img src="${escapeHtml(src)}" style="max-width:100%;border-radius:10px;border:1px solid ${C.line};box-shadow:0 4px 16px rgba(31,58,95,0.12);" />
  ${caption ? `<div style="font-size:13px;color:${C.textMuted};margin-top:8px;line-height:1.6;">${inline(caption)}</div>` : ''}
</section>`.trim()
}

// ====== 三大固定卡片 ======
function takeawayCard(items) {
  return `
<section style="margin:30px 0;padding:20px 20px 18px;background:${C.takeaway.bg};border-left:4px solid ${C.takeaway.border};border-radius:0 10px 10px 0;">
  <div style="font-size:15px;font-weight:800;color:${C.takeaway.text};margin-bottom:14px;">📌 本篇你可以带走</div>
  ${olList(items, C.takeaway)}
</section>`.trim()
}

function sourceCard(title, items) {
  // title 是原始 markdown 文本；items 是已渲染的 HTML 片段，直接拼接，禁止再 escape
  const body = items.join('\n')
  return `
<section style="margin:30px 0;padding:18px 20px;background:${C.source.bg};border:1px solid ${C.source.border};border-radius:10px;">
  <div style="font-size:12px;color:${C.source.tag};font-weight:700;letter-spacing:1px;margin-bottom:6px;">📊 数据来源与口径</div>
  ${title ? `<div style="font-size:15px;font-weight:800;color:${C.accentDark};margin-bottom:10px;">${inline(title)}</div>` : ''}
  <div style="font-size:14px;color:${C.source.text};line-height:1.85;">${body}</div>
</section>`.trim()
}

function hudongCard(text) {
  // text 是已渲染的 HTML 片段，直接注入，禁止再 escape
  return `
<section style="margin:30px 0;padding:20px 20px 22px;background:${C.hudong.bg};border-left:4px solid ${C.hudong.border};border-radius:0 10px 10px 0;">
  <div style="font-size:15px;font-weight:800;color:${C.hudong.text};margin-bottom:10px;">💬 今日互动</div>
  <div style="font-size:15px;color:${C.hudong.text};line-height:1.85;">${text}</div>
</section>`.trim()
}

function isFixedH2(t) {
  return /本篇你可以带走/.test(t) || /数据来源|数据说明|来源与口径/.test(t) || /今日互动/.test(t)
}

// ====== 主渲染 ======
export function markdownToWxHtml(md = '', { hero = '', figures = [] } = {}) {
  const lines = md.split('\n')
  const html = []

  let cardMode = null            // null | 'takeaway' | 'source' | 'hudong'
  let cardTitle = ''
  let cardBuffer = []
  let listItems = []
  let inList = false
  let listOrdered = false
  let tableRows = []
  let inTable = false
  let h2Count = 0
  let figIdx = 0
  let usedLead = false

  function closeList() {
    if (!inList) return
    inList = false
    if (cardMode === 'takeaway') return // 交给 takeawayCard 处理
    const rendered = renderList(listItems, listOrdered)
    if (cardMode === 'source' || cardMode === 'hudong') cardBuffer.push(rendered)
    else html.push(rendered)
    listItems = []
  }

  function flushTable() {
    if (!inTable) return
    inTable = false
    const rendered = renderTable(tableRows)
    if (cardMode === 'source' || cardMode === 'hudong') cardBuffer.push(rendered)
    else html.push(rendered)
    tableRows = []
  }

  function finishCard() {
    if (cardMode === 'takeaway') {
      html.push(takeawayCard(listItems))
      listItems = []
    } else if (cardMode === 'source') {
      html.push(sourceCard(cardTitle, cardBuffer))
      cardBuffer = []
    } else if (cardMode === 'hudong') {
      html.push(hudongCard(cardBuffer.join(' ')))
      cardBuffer = []
    }
    cardMode = null
  }

  for (let raw of lines) {
    const line = raw.trim()

    // 空行
    if (!line) { closeList(); flushTable(); continue }

    // 分隔线
    if (/^---+$/.test(line)) {
      closeList(); flushTable()
      if (!cardMode) {
        html.push(`<section style="margin:28px 0;text-align:center;color:${C.line};font-size:14px;letter-spacing:6px;">· · ·</section>`)
      }
      continue
    }

    // 图片 ![alt](url)
    const img = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)/)
    if (img) {
      closeList(); flushTable()
      const cap = img[1]
      const src = img[2]
      if (cardMode === 'source' || cardMode === 'hudong') cardBuffer.push(figure(src, cap))
      else html.push(figure(src, cap))
      continue
    }

    // 表格行
    if (line.startsWith('|') && line.endsWith('|')) {
      closeList()
      if (/^\|[\s:-]+\|/.test(line)) continue // 分隔行 |---|---|
      inTable = true
      tableRows.push(line.slice(1, -1).split('|').map(c => c.trim()))
      continue
    }

    // 引用
    if (line.startsWith('> ')) {
      closeList(); flushTable()
      const q = blockquote(line.slice(2))
      if (cardMode === 'source' || cardMode === 'hudong') cardBuffer.push(q)
      else html.push(q)
      continue
    }

    // 二级标题
    if (line.startsWith('## ')) {
      closeList(); flushTable()
      const titleText = line.slice(3).trim()

      // 收尾上一个卡片
      finishCard()

      // 进入固定卡片
      if (/本篇你可以带走/.test(titleText)) { cardMode = 'takeaway'; continue }
      if (/数据来源|数据说明|来源与口径/.test(titleText)) { cardMode = 'source'; cardTitle = titleText; continue }
      if (/今日互动/.test(titleText)) { cardMode = 'hudong'; continue }

      // 普通二级标题：计数 + 按位置插入配图
      if (!isFixedH2(titleText)) {
        h2Count++
        if ((h2Count === 2 || h2Count === 4) && figIdx < figures.length) {
          html.push(figure(figures[figIdx].src, figures[figIdx].caption))
          figIdx++
        }
        html.push(h2(titleText))
      }
      continue
    }

    // 列表项（- / * / 1.）
    const mUL = line.match(/^[-*]\s+(.*)/)
    const mOL = line.match(/^\d+\.\s+(.*)/)
    if (mUL || mOL) {
      flushTable()
      if (!inList) { inList = true; listOrdered = !!mOL && !mUL }
      listItems.push(mUL ? mUL[1] : mOL[1])
      continue
    }

    // 普通段落
    closeList(); flushTable()
    if (cardMode === 'source' || cardMode === 'hudong') {
      cardBuffer.push(paragraph(line))
    } else if (cardMode === 'takeaway') {
      cardBuffer.push(paragraph(line))
    } else {
      // 正文首段：结论前置强调块
      const lead = !usedLead
      if (lead) usedLead = true
      html.push(paragraph(line, { lead }))
    }
  }

  // 收尾
  closeList(); flushTable(); finishCard()

  // 文内图没用完，尾部补齐
  while (figIdx < figures.length) {
    html.push(figure(figures[figIdx].src, figures[figIdx].caption))
    figIdx++
  }

  const bodyHtml = html.join('\n')
  return `<section style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:${C.text};">
${hero}
${bodyHtml}
</section>`
}
