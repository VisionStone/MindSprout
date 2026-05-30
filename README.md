# 🌱 MindSprout 思维芽

> AI 驱动的智能思维导图桌面应用

[![Electron](https://img.shields.io/badge/Electron-36.2.0-47848F?logo=electron)](https://electronjs.org/)
[![SolidJS](https://img.shields.io/badge/SolidJS-1.9.5-446b9e?logo=solid)](https://solidjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ 核心特性

- **🤖 AI 智能生成** — 输入主题，AI 自动生成完整思维导图
- **🔄 智能扩展** — 对任意节点发起 AI 扩展，自动补充相关内容
- **📝 内容增强** — 为节点生成详细描述，支持富文本展示
- **🎨 灵活编辑** — 自由拖拽、折叠展开、自动布局
- **💾 本地存储** — 基于 SQLite 的本地数据持久化
- **🔍 知识库支持** — 集成 RAG 知识库，支持文档导入和语义检索
- **🎯 多布局模式** — 层级布局、径向布局、力导向布局

---

## 📸 界面预览

*应用界面截图即将添加*

---

## 🚀 快速开始

### 环境要求

- Node.js ≥ 18
- npm 或 pnpm

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建应用

```bash
npm run build
npm start
```

---

## 🏗️ 项目架构

```
MindSprout/
├── electron/           # Electron 主进程
│   ├── ai/            # AI 服务与任务管理
│   ├── db/            # SQLite 数据库与数据模型
│   ├── ipc/           # IPC 通信处理
│   └── kb/            # 知识库服务（RAG）
├── src/               # 渲染进程（SolidJS）
│   ├── canvas/        # Canvas 渲染引擎
│   ├── components/    # UI 组件
│   ├── pages/         # 页面组件
│   ├── stores/        # 状态管理
│   └── types/         # TypeScript 类型定义
├── docs/              # 项目文档
└── design-systems/    # 设计系统
```

### 技术栈

| 层级 | 技术 |
|-----|------|
| 桌面框架 | Electron |
| 前端框架 | SolidJS |
| 构建工具 | Vite |
| 状态管理 | SolidJS Signals |
| 数据库 | better-sqlite3 |
| AI 集成 | Llumiverse |
| 测试框架 | Vitest |

---

## 📖 功能说明

### 思维导图管理

- ✅ 创建空白导图或 AI 生成导图
- ✅ 导图列表管理与搜索
- ✅ 公开/私有可见性设置
- ✅ 节点拆分独立成图

### 画布编辑

- ✅ 拖拽、缩放、平移
- ✅ 节点添加、编辑、删除
- ✅ 拖拽重组父子关系
- ✅ 折叠/展开节点
- ✅ 键盘导航支持
- ✅ 多种自动布局算法

### AI 功能

- ✅ 主题生成完整思维导图
- ✅ 节点智能扩展
- ✅ 节点描述生成
- ✅ 任务管理与通知中心

### 知识库

- ✅ 文档导入（PDF、Word、TXT）
- ✅ 自动分块与向量化
- ✅ 语义检索与问答

---

## 🛠️ 开发计划

详见 [next-steps.md](./next-steps.md)

**Phase 1（核心稳定性）**
- [ ] 测试覆盖
- [ ] 自动保存
- [ ] 撤销/重做

**Phase 2（功能增强）**
- [ ] 更多布局算法
- [ ] 导出功能（图片/PDF/Markdown）
- [ ] 快捷键体系
- [ ] 画布内搜索

**Phase 3（体验打磨）**
- [ ] 性能优化
- [ ] 节点样式增强
- [ ] 多语言支持

---

## 📄 文档

- [产品需求文档 (PRD)](./PRD.md)
- [设计文档](./docs/superpowers/specs/)
- [开发计划](./docs/superpowers/plans/)

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## 📄 许可证

[MIT](LICENSE) © 2026 MindSprout Contributors

---

## 🙏 致谢

- [SolidJS](https://solidjs.com/) - 高性能响应式前端框架
- [Electron](https://electronjs.org/) - 跨平台桌面应用框架
- [Llumiverse](https://github.com/llumiverse) - AI 模型统一接口
- [dagre](https://github.com/dagrejs/dagre) - 图布局算法
