# 后端 API

Node.js + Express + SQLite，为园林大使培训系统提供数据与文件服务。

## 启动

```bash
npm run dev          # 前端（自动拉起本后端）
npm run dev:server   # 仅后端，默认 http://localhost:3001
```

## 数据存储

| 路径 | 说明 |
|------|------|
| `server/data/app.db` | SQLite 数据库（用户、知识库元数据） |
| `server/data/settings.json` | 系统与 AI 配置 |
| `server/uploads/` | 上传的文件 |

## 默认账号（密码均为 `123456`）

| 用户名 | 角色 | 姓名 |
|--------|------|------|
| admin | 管理员 | 张明 |
| new | 全新大使 | 李华 |
| certified | 正式大使 | 王芳 |

## 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/quick-login` | 快捷登录（仅用户名，开发用） |
| POST | `/api/auth/login` | 账号密码登录，返回 JWT |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/users` | 大使列表（管理员） |
| GET/POST/PUT/DELETE | `/api/materials` | 知识库 CRUD |
| POST | `/api/materials/:id/files` | 上传附件（multipart） |
| GET | `/api/settings` | 配置（管理员） |
| POST | `/api/chat` | 知识库 AI 对话 |

请求头：`Authorization: Bearer <token>`

## 环境变量

见项目根目录 `.env.example`，可选 `JWT_SECRET` 用于登录令牌签名。
