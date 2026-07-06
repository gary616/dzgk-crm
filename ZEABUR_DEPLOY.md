# Zeabur + PostgreSQL 部署指南

Zeabur 是国内服务器节点，国内访问速度极快（< 500ms），支持 Python/Flask 一键部署。

## 第一步：推送代码到 GitHub

```bash
cd D:\gkdz
git init
git add .
git commit -m "CRM v2.67"

# 在 GitHub 新建仓库后
git remote add origin https://github.com/你的用户名/crm.git
git push -u origin main
```

## 第二步：Zeabur 部署

1. 打开 https://zeabur.com 用 GitHub 登录
2. 点击 **新建项目**
3. 选择 **从 GitHub 导入** → 授权后选择刚推送的仓库
4. Zeabur 自动识别为 Python 项目 → 自动安装依赖
5. 部署完成后，点击 **设置** → **域名** → 绑定 `xxx.zeabur.app`

## 第三步：添加 PostgreSQL 数据库

1. 在项目页面点击 **+ 添加新服务**
2. 选择 **数据库** → **PostgreSQL**
3. 等待创建完成
4. 在 PostgreSQL 服务的 **连接** 页获取 `DATABASE_URL`
5. 将 `DATABASE_URL` 设置为 Web 服务的 **环境变量**

## 第四步：导入本地数据

Zeabur 部署完成后，空表会自动创建。需要导入本地数据：

**方式一：psql 命令行**
```bash
# 从 Zeabur PostgreSQL 连接页获取连接命令
psql "$DATABASE_URL" -f crm_pg_export.sql
```

**方式二：Zeabur 后台**
- PostgreSQL 服务 → **数据管理** → 导入 SQL
- 把 `crm_pg_export.sql` 内容粘贴进去执行

## 完成

部署成功后会生成 `https://你的项目.zeabur.app` 域名。

## 后续更新

```bash
git add .
git commit -m "更新说明"
git push
```
Zeabur 自动检测到更新并重新部署。

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | Zeabur PostgreSQL 连接串（手动设置） |
| `PORT` | Zeabur 自动设置 |

## 注意事项

- 管理员账号: admin / admin123（首次启动自动创建）
- 所有用户密码和本地一致
- 上传的截图不会同步，需要在正式环境重新上传
- 合同数据存在 localStorage，不会迁移
- Zeabur 免费版有带宽和存储限制，正式使用建议升级付费

## 国内 vs 国外部署对比

| 平台 | 国内速度 | 免费额度 | 推荐度 |
|------|---------|---------|--------|
| **Zeabur**  | ✅ 快 | 有 | ⭐⭐⭐⭐⭐ |
| Railway | ❌ 慢 | 有 | ⭐⭐ |
| Render | ❌ 慢 | 有 | ⭐⭐ |
