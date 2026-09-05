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

## 六、第二阶段：按「创作总纲」重构（2026-09-06）

用户提供一套《城市生活成本对比 · 一站式AI创作提示词总纲》，要求提升内容质量、
重规划近七天、并把封面升级为 5:2 高级概念海报。

### 1. 新增 skill：city-cost-writer
`.claude/skills/city-cost-writer/SKILL.md` —— 固化创作总纲：
角色设定、核心数据输入、五段结构（吸睛标题→年度总账钩子→主体ABCD→金句→CTA）、
排版规则、数据口径、5:2 概念海报封面规范、数据可视化插图规范。

### 2. 出图升级为「概念海报」标准（imagemaker.js）
- 封面：**5:2 横向高级概念海报**（`1536x614`）——主文字为核心、元素服务含义、不套模板
- 支持 frontmatter 的 `cover_text`（海报主文案）/ `cover_concept`（视觉概念/关系）驱动
- 插图偏数据可视化；`extractDataHint()` 继续从正文表格抽真实数据
- `cover.js` 兜底封面同步改 5:2（1500x600）
- 两个 baoyu skill 的 EXTEND.md 同步为概念海报取向（typography / null palette / bold / 5:2）

### 3. 正文剥离「封面与配图要求」段（publish.js）
- 每篇 md 末尾的 `## 封面与配图要求` 是给出图/人工用的配置，非读者正文
- `stripImageSpec()` 在渲染 HTML 前剥离该段；出图逻辑只读 frontmatter + 表格，不受影响

### 4. 重写近七天 7 篇（content/2026-09-07_to_09-13/）
周一(城市对比·月薪两万) / 周二(城市对比·打拼十年vs安家十年) / 周三(住房·房价跌了更不敢买) /
周四(家庭账本·养娃68万) / 周五(就业迁徙·抢人城市) / 周六(城市选择·35岁五笔账) /
周日(家庭财务·月入过万没安全感)。每篇 1500~2400 字，含数据表/通勤或隐形成本/正反案例/
人群建议/金句/CTA/数据口径 + 封面与配图要求。周一为人工范文，其余 6 篇并行 subagent 按范文写。

### 5. 全部进草稿箱
- 7 篇全部发布，封面均为 1983×793（比例 2.50，即 5:2），零回退图
- 出图撞到几次 503/524，重试退避机制自愈成功
- 旧版 3 篇草稿（09-08/09-10/09-14）仍在草稿箱，待用户确认删除

### 6. Git
- commit `2eb6203`，推送时本机代理（127.0.0.1:10792）临时断连，重连代理后推送成功

## 七、关键决策与注意点

- **图片风格只对新生成的图生效**：改 prompt 后需 `--rebuild` 清缓存重出图
- **回退图会被缓存**：出图失败写的渐变占位图（<50KB）会缓存，重跑前需删除
- **切换内容周需清缓存**：图缓存按星期命名，换周发布前先 `rm images/*.png`，否则复用上周图
- **图中中文是最大变数**：gpt-image-2 出中文偶有糊字/错字，可缩短主文字或退回少字策略
- **只重建正文不重烧图**：改了渲染逻辑（如剥离配图段）后，用 `--only 周X`（不带 --rebuild）
  复用缓存图、只重建草稿正文，省出图开销
- **推送依赖本机代理**：git 走 `http.proxy=127.0.0.1:10792`，代理断则连接重置，非代码问题

## 八、待办 / 下一步

- [ ] 去草稿箱确认 7 篇的 5:2 封面海报主文字是否清晰无错字
- [ ] 确认后删除旧版 3 篇草稿（09-08「同样月薪一万」/09-10「正在离开的十座城市」/09-14「各省结婚」）
- [ ] 开启定时发布 `npm run schedule`（每日晚 20:00）
- [ ] 若旧仓库曾提交过真实 AppSecret，建议去公众号后台重置
