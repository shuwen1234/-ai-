---
version: 3

watermark:
  enabled: false
  content: ""
  position: bottom-right

preferred_type: conceptual

preferred_palette: cool

preferred_rendering: digital

preferred_text: title-only

preferred_mood: balanced

default_aspect: "2.35:1"

quick_mode: false

language: zh

preferred_image_backend: gpt-image-bridge

custom_palettes:
  - name: city-blue
    description: "城市生活账本账号主视觉：高级现代城市插画 + 科技感 + 数据可视化"
    colors:
      primary: ["#0D2B52", "#1F6FEB", "#3D8BD4"]
      background: "#0A1830"
      accents: ["#4A90D9", "#7FB2E5", "#28E0D8"]
    decorative_hints: "等距(isometric)现代都市与天际线、发光数据流与网格、半透明全息数据面板、悬浮图表、霓虹青色高光，电影级光影，未来科技氛围，大气留白"
    best_for: "城市数据、收入房价对比、人口迁徙、家庭账本类文章"
---

# 城市生活账本 · 封面偏好

本账号定位：**用数据看城市，用故事讲普通人的生活选择**。封面统一走简约大气的蓝色数据风。

## 图像后端（自定义桥接）

`preferred_image_backend: gpt-image-bridge` 指向本项目自带的桥接脚本，它复用项目现有的
gpt-image-2 通道（`ai.112102.xyz`），**无需额外配置 API key**。

当流程走到「生成图像」这一步时，不要去找 codex / baoyu-image-gen，直接在**项目根目录**执行：

```bash
# 从文件读 prompt（推荐；prompt 已由本 skill 存到 prompts/cover.md）
node scripts/imggen.mjs --promptfiles prompts/cover.md --image images/covers/<slug>.png --ar 2.35:1

# 或直接传文本
node scripts/imggen.mjs --prompt "<拼好的英文/中文 prompt>" --image images/covers/<slug>.png --ar 2.35:1
```

参数说明：
- `--ar` 接受 `2.35:1` / `16:9` / `1:1`，桥接器会映射到就近尺寸（横图 1536×1024、方图 1024×1024、竖图 1024×1536）。
- `--image` 输出路径；父目录自动创建。建议统一放 `images/covers/`。
- 成功打印 `✅ <path> (<size>)` 且退出码 0；失败会回退一张蓝色渐变占位图并以退出码 1 提示。

## 默认取向

- **类型** conceptual：抽象表达文章核心观点（比 hero 更克制，契合数据账号调性）。
- **配色** cool：工程蓝 / 藏蓝 / 青，和账号主视觉一致；需要更强品牌感时可指定自定义调色板 `city-blue`。
- **渲染** digital：干净精确的边缘、细腻渐变，贴合信息图质感。
- **文字** title-only：只保留主标题，避免封面过载。
- **宽高比** 2.35:1：适合公众号文章头图与分享卡。
