# Inline-4 Moto Engine Simulator (四缸摩托车发动机物理与声浪模拟器)

<p align="left">
  <a href="https://xiaoa0v0.github.io/Inline4-Engine-Sim/" target="_blank">
    <img src="https://img.shields.io/badge/Live%20Demo-%E7%82%B9%E5%87%BB%E5%9C%A8%E7%BA%BF%E8%BD%B0%E6%B2%B9%E4%BD%93%E9%AA%8C-ef4444?style=for-the-badge&logo=githubpages&logoColor=white" alt="Live Demo" />
  </a>
  <img src="https://img.shields.io/badge/Tech-HTML5%20Canvas%20%2B%20Web%20Audio%20API-38bdf8?style=for-the-badge" alt="Tech Stack" />
  <img src="https://img.shields.io/badge/Dependencies-Zero-34d399?style=for-the-badge" alt="Zero Dependencies" />
  <img src="https://img.shields.io/badge/License-MIT-6366f1?style=for-the-badge" alt="License" />
</p>

一款**纯前端、零依赖**的**直列四缸摩托车发动机实时运动学剖面 & Web Audio 物理声浪模拟器**。不仅能直观看到双顶置凸轮轴（DOHC）、进排气门弹簧、火花塞提前点火、四冲程燃烧膨胀与曲柄滑块机构的精确联动，还可以实时调节**曲轴偏角（平面曲轴 180° / 雅马哈十字曲轴 CP4 / MotoGP Big-Bang / 完全自定义四缸偏角）、转速、缸径与行程、连杆比、压缩比、点火提前角、气门重叠角、红线断油风格与排气管声浪**！

🏍️ **在线体验地址（建议戴耳机开启声浪）**：https://xiaoa0v0.github.io/Inline4-Engine-Sim/

---

## ✨ 核心亮点

### 1. 🔧 真实曲柄滑块机构与 DOHC 四冲程剖面动画
- 基于精确曲柄连杆运动学方程渲染 4 个剖面气缸、活塞环、活塞销、H 型连杆、配重曲轴与双顶置凸轮轴（DOHC）。
- **实时气门与燃烧可视化**：进气蓝色混合气 → 压缩升温变色 → 按真实提前角触发的火花塞高压电弧 → 做功火焰膨胀 → 排气歧管受热变红与收油回火喷火！
- **无级时间倍率慢放（`0.008x ~ 1.0x`）**：拉低时间倍率即可像高速摄影机一样逐帧看清四冲程气门重叠与点火顺序。

### 2. 🌀 曲轴架构与四缸独立曲柄偏角自由 DIY
- **平面曲轴 Flat-Plane 180° (`1-3-4-2` / `1-2-4-3`)**：经典日系直四哨音（ZX-4RR、CBR1000RR-R、CB400）。
- **雅马哈十字曲轴 Crossplane CP4 (`270°-180°-90°-180°`)**：真实复刻雅马哈 R1 的 90° 十字曲轴端面相序与不等间隔厚重声浪！
- **赛车 Big-Bang 双发同步点火 (`360°` 大间隔)**：感受强脉冲暴躁节奏。
- **四缸独立偏角滑块（0°~715°）**：自由 DIY 任意奇葩曲柄夹角，左侧剖面、**曲轴端面相位雷达**、720° 点火轴和**排气管声浪**实时联动改变！

### 3. 🔊 Web Audio API 实时物理点火脉冲声浪合成器
- 非录音循环播放！内核按样本级时间精度追踪每一缸穿过点火角的时间点触发独立排气脉冲，因此切换**平面曲轴 vs 十字曲轴 vs Big-Bang vs 自定义偏角**时，声浪节奏与谐波会立刻发生真实物理变化。
- 支持调节：**原厂回压 / 天蝎全段钛合金 / MotoGP 竞技直通管** 音色、**硬断油 / 软断油 / 暴躁喷火断油**保护、以及**高转收油回火放炮（Pops & Bangs）**。

### 4. 📊 实时马力机曲线（Dyno）+ 6 速序列式变速箱
- 调整缸径（Bore）、行程（Stroke）、压缩比、点火提前角与气门重叠角时，实时重绘整机 **马力（HP）与扭矩（N·m）曲线** 与峰值参数，并实时叠加 Web Audio 排气示波器波形。
- 内置 6 速序列式变速箱（`N / 1~6` 档），支持按住油门、点油门补油（Blip）、降档自动补油与锁定目标转速巡航。

---

## 🎮 快捷操作说明

- **`Space` / `W`**：按住全油门轰转，松开触发高转收油回火
- **`E` / `↑`**：快速升档（1~6 档）
- **`Q` / `↓`**：降档自动补油（Blip）
- **`M`**：一键开启 / 静音实时物理声浪

---

## 🚀 本地离线运行

无需任何后端或编译环境，克隆后直接用浏览器双击 `index.html` 即可在电脑本地运行：

```bash
git clone https://github.com/xiaoA0v0/Inline4-Engine-Sim.git
```

---

## 📄 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
