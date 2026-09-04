// 定时发送守护进程
// 每天 PUBLISH_HOUR:PUBLISH_MINUTE（北京时间）检查：今天有没有该发的草稿？
// 有就调 freepublish/submit 提交发布，并在 drafts_state.json 标记 published。
//
// 用法：node src/scheduler.js
// 建议用 pm2 / 计划任务常驻，或每天开机自动跑一次。

import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import cron from 'node-cron'
import { submitPublish } from './publish.js'

const STATE_PATH = resolve(process.cwd(), 'drafts_state.json')
const HOUR = parseInt(process.env.PUBLISH_HOUR || '20', 10)
const MINUTE = parseInt(process.env.PUBLISH_MINUTE || '0', 10)

function readState() {
  return existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : { uploaded: [] }
}
function writeState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

// 今天日期（北京时间）YYYY-MM-DD
function todayCN() {
  const now = new Date(Date.now() + 8 * 3600 * 1000) // UTC+8
  return now.toISOString().slice(0, 10)
}

async function publishToday() {
  const state = readState()
  const today = todayCN()
  const due = state.uploaded.filter(u => u.date === today && !u.published)

  if (!due.length) {
    console.log(`[${new Date().toLocaleString()}] 今天(${today})没有待发布草稿`)
    return
  }

  for (const item of due) {
    try {
      console.log(`📤 发布：${item.title}`)
      const publishId = await submitPublish(item.media_id)
      item.published = true
      item.publish_id = publishId
      item.published_at = new Date().toISOString()
      writeState(state)
      console.log(`   ✅ 已提交发布 publish_id: ${publishId}`)
    } catch (e) {
      console.error(`   ❌ 发布失败：${e.message}`)
    }
  }
}

const args = process.argv.slice(2)

if (args.includes('--now')) {
  // 立即执行一次（测试用）
  await publishToday()
} else {
  // 常驻：每天定点触发
  const expr = `${MINUTE} ${HOUR} * * *`
  console.log(`⏰ 定时发送已启动：每天 ${HOUR}:${String(MINUTE).padStart(2, '0')}（服务器本地时间）检查发布`)
  console.log(`   cron: ${expr}`)
  cron.schedule(expr, publishToday)
}
