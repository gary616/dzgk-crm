# 地址挂靠管理系统 - 线上部署指南

> **国内访问优先推荐 Zeabur**（国内节点，速度快）
> 详细步骤请参考 `ZEABUR_DEPLOY.md`

## 推荐方案：Zeabur（国内用户首选 ⭐）

国内服务器节点，访问速度快（< 500ms），支持 Python/Flask + PostgreSQL。

详细步骤见 [ZEABUR_DEPLOY.md](./ZEABUR_DEPLOY.md)

## 备选方案

### Railway（国外）
1. 注册 https://railway.app 用 GitHub 登录
2. 新建项目 → Deploy from GitHub repo → 选本仓库
3. 添加 PostgreSQL 数据库
4. 部署完成自动分配 https://xxx.railway.app 域名
5. ⚠️ 国外节点，国内访问较慢

### Render（国外）
1. 注册 https://render.com 用 GitHub 登录
2. New → Web Service → 连 GitHub 仓库
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `gunicorn server:app -b 0.0.0.0:$PORT --timeout 120`
5. ⚠️ 国外节点，国内访问较慢

## 环境变量

- `DATABASE_URL` — PostgreSQL 连接串（生产环境必须设置）
- `PORT` — 监听端口，默认 8080（云平台会自动设置）

## 首次启动

系统首次启动会自动初始化演示数据和管理员账号：
- 管理员: admin / admin123
- 业务员: sales01 / 123456（高恩伟）
- 业务员: sales02 / 123456（虞柯柯）
- 财务: finance01 / 123456
