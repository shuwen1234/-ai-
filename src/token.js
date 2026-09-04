// access_token 获取 + 本地缓存
// 微信 access_token 有效期 7200 秒，且获取次数有限，必须缓存复用。
// 缓存文件 token_cache.json（已 gitignore）。
//
// 前置条件：
//   1) .env 里 APPID / APPSECRET 正确
//   2) 公众号后台把本机公网出口 IP 加进「IP 白名单」，否则报 40164

import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const CACHE_PATH = resolve(process.cwd(), 'token_cache.json')
const BASE = 'https://api.weixin.qq.com/cgi-bin'

function readCache() {
  if (!existsSync(CACHE_PATH)) return null
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
  } catch {
    return null
  }
}

function writeCache(token, expiresIn) {
  // 提前 5 分钟过期，留出余量
  const expireAt = Date.now() + (expiresIn - 300) * 1000
  writeFileSync(CACHE_PATH, JSON.stringify({ token, expireAt }, null, 2))
}

export async function getAccessToken({ force = false } = {}) {
  if (!force) {
    const cache = readCache()
    if (cache && cache.token && cache.expireAt > Date.now()) {
      return cache.token
    }
  }

  const appid = process.env.APPID
  const secret = process.env.APPSECRET
  if (!appid || !secret || appid.startsWith('REPLACE')) {
    throw new Error('缺少 APPID/APPSECRET，请检查 .env')
  }

  const url = `${BASE}/token?grant_type=client_credential&appid=${appid}&secret=${secret}`
  const res = await fetch(url)
  const data = await res.json()

  if (data.errcode) {
    throw new Error(`获取 access_token 失败：[${data.errcode}] ${data.errmsg}`)
  }

  writeCache(data.access_token, data.expires_in)
  return data.access_token
}

// 直接运行时做一次连通性测试
if (process.argv[1] && process.argv[1].endsWith('token.js')) {
  const token = await getAccessToken()
  console.log('当前 token（前20位）：', token.slice(0, 20) + '...')
}
