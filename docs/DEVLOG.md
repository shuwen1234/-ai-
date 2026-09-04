# 城市生活账本 · 开发记录

> 记录日期：2026-09-05
> 项目路径：`D:\cityWechat`
> 远程仓库：https://github.com/shuwen1234/-ai-（master 分支）

## 一、项目背景

基于运营规划 PDF《公众号运营方向分析报告 · 城市数据与普通人生活变化赛道规划》，
在旧项目 `D:\softWare\Paseo\wechat-publish-translation`（暖色治愈系 / 失业记录人设）
的技术架构基础上，改造出全新账号 **城市生活账本**。

- **核心赛道**：城市数据与普通人生活变化
- **核心读者**：25–45 岁城市生活者及家庭决策者
- **一句话定位**：用数据看城市，用故事讲普通人的生活选择
- **单篇模板**：反常识结论 → 1~3 组关键数据（标来源口径）→ 普通人案例 → 可执行建议 → 互动问题
- **发布节奏**：每周二、周四、周日晚 20:00 各 1 篇

## 二、技术架构（复用旧项目管线）

```
src/
  token.js        access_token 获取 + 缓存（7200s，提前 5min 过期）
  png.js          纯 Node 生成渐变 PNG（AI 出图失败时兜底）
  cover.js        7 天蓝色系兜底配色
  imagemaker.js   gpt-image-2 出图（ai.112102.xyz）+ 微信素材上传
  markdown.js     Markdown → 微信富文本（蓝色数据风渲染器）
  publish.js      封面上传 + 建草稿 + CLI
  scheduler.js    node-cron 定时发布守护进程
scripts/
  imggen.mjs      baoyu skill 的图像后端桥接器
content/2026-09-08_to_09-14/   一周稿件 + 选题表
```

发布全流程（每篇）：生成/复用 3 张图 → 封面进永久素材得 thumb_media_id →
2 张文内图上传得外链 url → markdownToWxHtml 渲染 → draft/add 建草稿。

## 三、本次会话完成的工作（时间线）

### 1. 搭项目骨架
- 复制 `.env`（真实微信凭证）、`.env.example`、`.gitignore`、`package.json`
- 项目无关文件（token.js / png.js / scheduler.js）原样移植
- 发布时间从旧的 8:30 改为晚间 20:00

### 2. 重做渲染器为「蓝色数据风」（markdown.js）
- 配色：深藏蓝 `#12345F` / 主蓝 `#1F6FEB`，hero 深蓝渐变
- 表格：深蓝表头 + 白字 + 斑马纹（`#f4f8fd`），数据风核心组件
- 首段「结论前置」强调块（左蓝边框）
- 三大固定卡片改为：📌 本篇你可以带走 / 📊 数据来源与口径 / 💬 今日互动

### 3. 写一周内容（content/）
- 周二 · 城市对比 —— 同样月薪一万，在六座城市最后能剩下多少
- 周四 · 人口迁徙 —— 年轻人正在离开的十座城市，有你的家乡吗
- 周日 · 婚姻人口 —— 各省结婚人数变化，真正改变的不是彩礼
- 选题表.md（含首月后续储备 + 栏目占比 + 风险自检清单）
- **数据合规**：所有数字标注为「测算模型 / 趋势方向（非官方数据）」，写明口径假设，
  不编造官方数字（遵循 PDF 风险控制条款）

### 4. 首次发布验证
- token 连通性通过、IP 白名单正常
- 周二那篇成功进微信草稿箱

### 5. 集成 baoyu skill（用户要求）
- 从 https://github.com/JimLiu/baoyu-skills 装入两个项目内 skill：
  - `baoyu-cover-image`（封面，5 维度）
  - `baoyu-article-illustrator`（内容插图，Type×Style×Palette）
- 环境无 codex / bun，写桥接器 `scripts/imggen.mjs`：
  兼容 baoyu CLI 约定（`--prompt/--promptfiles/--image/--ar`），内部走现有 gpt-image-2 通道
- `.baoyu-skills/<skill>/EXTEND.md` 钉住 `preferred_image_backend: gpt-image-bridge`，
  默认取向设为账号蓝色数据调性

### 6. 修复 524 超时（根因修复）
- 现象：连着出图时上游返回 Cloudflare 524 / fetch failed，回退渐变占位图并被缓存
- 修复：`imagemaker.js` 和 `imggen.mjs` 都加 **180s 超时 + 最多 3 次重试 + 指数退避**
- 清理了此前 4993 字节的渐变回退图

### 7. 三项体验优化（用户要求）
- **表格自适应**：外层横向滚动容器 + 数字 `nowrap` + 文本列可换行 + 紧凑排版，手机不溢出
- **封面嵌标题**：prompt 要求以中文字体排入文章主标题
- **插图嵌真实数据**：`extractDataHint()` 自动从正文表格抽核心指标（如「每月结余」）做信息图
- 图片风格从「扁平信息图」升级为「高级城市插画 + 科技感」（等距都市 / 发光数据流 / 全息面板）

### 8. 上传 Git
- 首次提交 `fbf7cc1`（91 文件），force push 覆盖远程
- `.env` / token_cache / drafts_state / images / node_modules 均被 gitignore，未上传

## 四、常用命令

```bash
npm run token           # 测 access_token 连通性
npm run upload:week     # 本周全部进草稿箱
npm run rebuild:week    # 删旧草稿 + 重生成图 + 重建
node src/publish.js --only 周四 --rebuild   # 重建某天
npm run status          # 本地发布状态
npm run schedule        # 启动定时发布守护进程

# baoyu 出图桥接（也可手动调）
node scripts/imggen.mjs --prompt "..." --image images/covers/x.png --ar 2.35:1
```

## 五、关键决策与注意点

- **图片风格只对新生成的图生效**：改 prompt 后需 `--rebuild` 清缓存重出图，否则复用旧缓存
- **回退图会被缓存**：出图失败写的渐变占位图（<50KB）会缓存，重跑前需删除
- **图中中文是最大变数**：gpt-image-2 出中文偶有糊字/错字，若不理想可缩短文字或退回少字策略
- **两条出图路径并行**：`imagemaker.js`（发布时批量自动配图）与 baoyu skill（精修单张），
  都连同一个 gpt-image-2 通道，风格已统一到「高级城市插画 + 科技感」

## 六、待办 / 下一步

- [ ] 去草稿箱确认周二那篇的表格排版（手机不溢出）+ 图中中文效果
- [ ] 确认满意后重建周四、周日：`node src/publish.js --only 周四 --rebuild`
- [ ] 若旧仓库曾提交过真实 AppSecret，建议去公众号后台重置
- [ ] 按 PDF 规划推进第 2~4 周选题（选题表.md 已列储备）
