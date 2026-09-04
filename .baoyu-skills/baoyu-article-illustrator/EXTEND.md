---
version: 1

watermark:
  enabled: false
  content: ""
  position: bottom-right

preferred_style:
  name: city-blue
  description: "高级现代城市插画 + 科技感，蓝色基调，数据可视化氛围，服务于城市数据类文章"

preferred_palette: mono-ink

language: zh

default_output_dir: illustrations-subdir

preferred_image_backend: gpt-image-bridge

generation_batch_size: 4

custom_styles:
  - name: city-blue
    description: "城市生活账本账号内容插图：高级现代城市插画 + 科技感，数据可视化氛围"
    color_palette:
      primary: ["#0D2B52", "#1F6FEB", "#3D8BD4"]
      background: "#0A1830"
      accents: ["#4A90D9", "#7FB2E5", "#28E0D8"]
    visual_elements: "等距(isometric)现代都市与天际线、发光的数据流与网格、半透明全息数据面板、悬浮柱状/折线图、霓虹青色高光，电影级光影，科技未来氛围，无文字或极少文字"
    typography: "现代无衬线，克制"
    best_for: "城市对比、收入房价、人口迁徙、家庭账本、婚姻人口类文章配图"
---

# 城市生活账本 · 内容插图偏好

本账号内容插图统一走**简约大气的蓝色数据风**，服务正文论点（对比、趋势、账本），而非纯装饰。

## 图像后端（自定义桥接）

`preferred_image_backend: gpt-image-bridge` 指向本项目的桥接脚本，复用现有 gpt-image-2 通道
（`ai.112102.xyz`），**无需额外 API key**。

走到「生成图像」这一步时，直接在**项目根目录**执行（每张插图一条命令，或用 --batchfile 批量）：

```bash
# 单张
node scripts/imggen.mjs --prompt "<拼好的插图 prompt>" --image images/illustrations/<slug>-1.png --ar 16:9

# 批量：写一个 batch.json 后
node scripts/imggen.mjs --batchfile batch.json
```

`batch.json` 格式：

```json
{
  "tasks": [
    { "prompt": "插图1 prompt", "image": "images/illustrations/a-1.png", "ar": "16:9" },
    { "prompt": "插图2 prompt", "image": "images/illustrations/a-2.png", "ar": "16:9" }
  ]
}
```

参数与封面桥接一致：`--ar` 映射就近尺寸，父目录自动创建，成功打印 `✅` 退出码 0，失败回退蓝色渐变图。

## 默认取向

- **风格** city-blue（自定义）：扁平信息图 + 蓝色基调，克制专业。
- **输出目录** illustrations-subdir：图片落在文章同级 `illustrations/` 子目录，便于随稿件管理。
- **配图原则** 只在正文真正需要"看图更好懂"的位置配图（数据对比、趋势、结构），不为配而配。
