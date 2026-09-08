---
name: citywechat-publish
description: 城市生活账本公众号一周内容的出图与发布运维流程。当用户要"发布/更新公众号"、"出这周的图/封面"、"把文章推进草稿箱"、"排期发布"、"重建某天草稿"或排查出图失败(524/503/回退图)时使用。串联写作(city-cost-writer)→出图(5:2概念海报+数据插图)→微信草稿箱→定时发送的完整流程，并内置踩坑处理。
---

# 城市生活账本 · 出图与发布流程

把一周文章从 Markdown 稿件变成微信草稿箱里带 5:2 概念海报封面 + 数据插图的图文，并按天定时发布。

配套写作方法见 skill `city-cost-writer`（负责正文）；本 skill 负责**出图 + 发布 + 运维**。

## 前置检查

1. 在项目根目录 `D:\cityWechat` 执行命令。
2. `.env` 需含有效 `APPID` / `APPSECRET`；公众号后台已将本机公网出口 IP 加入白名单（否则报 40164）。
3. `.env` 的 `CONTENT_DIR` 指向本周稿件目录，如 `content/2026-09-07_to_09-13`。
4. 稿件为带 frontmatter 的 `.md`，字段：`title / date / weekday / type / digest / cover_text / cover_concept / status`，
   末尾可含 `## 封面与配图要求`（渲染时自动剥离，不进正文）。
5. 先测连通性：`npm run token`（能打印 token 即 OK）。

## 标准发布流程

```bash
# 1) 切换到新的一周时，先清图片缓存（缓存按星期命名，否则会复用上周的图）
rm -f images/*.png

# 2) 单篇先验证效果（推荐先跑周一，确认 5:2 封面与正文无误）
node src/publish.js --only 周一 --rebuild

# 3) 满意后逐天或全周发布
node src/publish.js --only 周二 --rebuild
# ... 或全周：
npm run rebuild:week

# 4) 查看状态与草稿箱
npm run status
npm run list:drafts
```

- `--rebuild`：清该天图片缓存 + 重新出图 + 删旧草稿重建。**改了图 prompt 或换了周，用它。**
- 不带 `--rebuild`（如 `node src/publish.js --only 周一`）：复用已有缓存图，只重建草稿正文。
  **只改了正文/渲染逻辑、不想重烧图时，用它省开销。**

## 定时发布

```bash
npm run schedule      # 常驻守护进程，每天 PUBLISH_HOUR:PUBLISH_MINUTE(北京时间)自动提交当天草稿
npm run publish:now   # 立即检查并发布"今天该发的"（测试用）
```

发布时间在 `.env` 的 `PUBLISH_HOUR` / `PUBLISH_MINUTE`。需保持进程/机器在线。

## 出图规格（已内置于 src/imagemaker.js）

- **封面**：5:2 横向高级概念海报（`1536x614`）。主文字取 frontmatter 的 `cover_text`（无则用 title），
  视觉概念取 `cover_concept`。原则：主文字为核心、元素服务含义、不套模板、克制印刷质感。
- **插图1**：数据可视化概念图，自动从正文第一张表格抽真实数据（`extractDataHint`）做对比图。
- **插图2**：承接文章核心结论/矛盾的概念插图。
- 出图走 gpt-image-2 通道（`ai.112102.xyz`），已带 180s 超时 + 3 次重试指数退避。

## 常见问题排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 日志出现「回退渐变图」 | 上游 524/503 超时且重试用尽 | 删该天缓存重跑：`rm images/周X-*.png && node src/publish.js --only 周X --rebuild` |
| 新一周复用了旧图 | 缓存按星期命名，同名复用 | 换周前先 `rm -f images/*.png` |
| 回退图被缓存（<50KB 的 png） | 失败占位图也会写盘 | 删掉 <50KB 的 png 再重跑 |
| 图中中文糊字/错字 | gpt-image-2 出中文的固有变数 | 缩短 `cover_text` 字数、或在该篇 md 的配图要求里指定更短主文案 |
| `[40164]` | 出口 IP 不在白名单 | 公众号后台加当前公网 IP |
| `git push` 连接重置 | 本机代理断（如 127.0.0.1:10792） | 重连代理后再推 |

## 校验（发布后自检）

```bash
# 封面应为 5:2（约 1983x793 或 1536x614），且无 <50KB 的回退图
node -e "const fs=require('fs');for(const wd of ['周一','周二','周三','周四','周五','周六','周日']){const f='images/'+wd+'-cover.png';if(!fs.existsSync(f))continue;const b=fs.readFileSync(f);console.log(wd,b.readUInt32BE(16)+'x'+b.readUInt32BE(20),Math.round(b.length/1024)+'KB')}"
```

## 数据合规红线（每篇必查）

- 数字标注「测算模型/非官方」，写明口径与假设，不编造官方数字
- 标题不超过正文能支撑的证据，不把相关写成因果
- 案例化名、正反两面，不制造焦虑（同时给解释与建议）
- 封面主文字简体中文、无错字、无裁切
