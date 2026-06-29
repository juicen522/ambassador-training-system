# 园林大使培训系统

原型来自 [Figma Make](https://www.figma.com/make/Fc2jjcnULRWIyMmqbg1olP/%E5%A4%A7%E4%BD%BF%E5%9F%B9%E8%AE%AD%E7%B3%BB%E7%BB%9F%E6%A1%86%E6%9E%B6)（React + Vite + Tailwind v4 + shadcn 风格 UI）。

**技术栈：** 前端 React · 后端 Express + SQLite · 文件存本地 `server/uploads/`

详细 API 见 [server/README.md](server/README.md)。

## 本地开发

```bash
cd "/Users/tillyyang/大使培训系统"
npm install
npm run dev
```

浏览器打开 **http://localhost:5181/**（开发端口已固定为 5181）。路由与 Make 预览一致，例如 `/admin` 为培训管理后台。

### 局域网访问（手机 / 同事电脑）

1. 确保访问设备与运行 `npm run dev` 的电脑在**同一 WiFi 或网段**。
2. 在项目目录执行 `npm run dev`（已监听 `0.0.0.0`，终端会打印局域网地址，例如 `http://192.168.x.x:5181/`）。
3. 用手机或其他电脑浏览器打开该地址即可（**不要用 localhost**）。
4. 若无法打开，请在 Mac「系统设置 → 网络 → 防火墙」中允许 Node / 终端入站连接。

生产预览（可选）：`npm run build && npm run preview:lan`，并另开终端 `npm run dev:server`。

## 知识库：从本机添加资料

1. 登录后进入 **培训管理**（`/admin`）→ **知识库管理**。
2. 点击 **添加资料**，可 **一次选择多个本机文件**（PDF、图片、视频、Word 等）。
3. **自动识别文件名**：只选 1 个文件且未填标题时，标题会自动用文件名（去掉扩展名）。
4. **批量添加**：选多个文件且不填标题时，会按每个文件名各创建一条资料；若填写了标题，则合并为一条资料（含多个附件）。
5. 在 **知识库**（`/materials`）可浏览；有多文件时点击卡片会提示选择要打开的文件。

知识库资料与用户数据保存在服务端 **SQLite**（`server/data/app.db`），上传文件在 `server/uploads/`。多台电脑需部署同一后端或迁移数据库。

## 知识库 AI 助手（基于资料回答）

AI **只根据知识库里的资料**回答（标题、简介、以及 `.txt` / `.md` 正文摘录），不会凭空编造。

### 配置步骤（推荐：在管理后台配置）

1. 启动服务：`npm run dev:all`
2. 管理员登录 → **培训管理** → **配置管理**
3. 在 **AI 接口配置** 中填写 API Key、选择服务商预设，点击 **测试连接** 后 **保存全部**

也可在根目录 `.env` 中设置 `AI_API_KEY` 作为初始值；保存到配置管理后会写入 `server/data/settings.json`（已加入 .gitignore）。

### 启动服务

1. 可选：复制 `.env.example` 为 `.env` 作为备用密钥
2. 安装依赖后启动开发环境（**会自动启动配置 / AI 后端**）：

```bash
npm install
npm run dev
```

若仍提示无法连接配置服务，可另开终端执行 `npm run dev:server` 后刷新页面。

3. 打开 **知识库**（`/materials`），在底部输入问题。

### 说明

- API Key 保存在服务端 `server/data/settings.json`，管理界面不会把完整 Key 返回给浏览器。
- **配置管理** 还可设置：系统名称、AI 欢迎语、功能开关（周测、知识答题、快捷登录等）。
- PDF/Word 暂不会解析正文，仅使用资料元数据；上传 `.txt` / `.md` 可把全文纳入上下文。
- 要更强「按 PDF 问答」需后续增加文档解析与向量检索（RAG）。

## 与 Figma Make 同步

在 Cursor 中启用 **Figma MCP** 并登录 Figma 后，可把 Make 项目当作 MCP 资源拉取源码与图片；也可在对话里附上 Make 链接，让助手按需下载或对比文件。

首次落地时，`AdminPanel.tsx` 中「大使管理」分组的 JSX 括号已按可编译结构补全（与 Make 导出相比仅做语法修复）。
