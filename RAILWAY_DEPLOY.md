# Railway + PostgreSQL 部署

## 第一步：准备代码

```bash
# 初始化 git
cd D:\gkdz
git init
git add .
git commit -m "CRM v2.67 - 完整版"

# 在 GitHub 创建仓库后关联
git remote add origin https://github.com/你的用户名/crm.git
git push -u origin main
```

## 第二步：Railway 部署

1. 注册 https://railway.app （用 GitHub 登录）
2. 点击 **New Project** → **Deploy from GitHub repo**
3. 选择刚推送的仓库
4. 项目创建后，点击 **+ New** → **Database** → **PostgreSQL**
5. Railway 自动注入 `DATABASE_URL` 环境变量到你的 Web Service

## 第三步：导入数据

部署成功后，Railway 会自动安装依赖并启动。
**首次启动会自动创建空表**。需要把本地数据导入：

```bash
# 获取 PostgreSQL 连接信息（Railway Dashboard → PostgreSQL → Connect）
# 用 psql 导入数据
psql "$DATABASE_URL" -f crm_pg_export.sql
```

或者通过 Railway 的 **SQL Console** 直接粘贴 `crm_pg_export.sql` 的内容执行。

## 第四步：使用

部署完成后 Railway 会自动分配 `https://xxx.railway.app` 域名。
可在 Dashboard → Settings → Generate Domain 中自定义。

## 后续更新

本地修改后：
```bash
git add .
git commit -m "更新说明"
git push
```
Railway 会自动重新部署。

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | Railway PostgreSQL 自动注入 |
| `PORT` | Railway 自动设置 |
| `CRM_DB` | 仅 SQLite 模式使用，PG 模式忽略 |

## 注意事项

- 管理员账号: admin / admin123（首次启动自动创建）
- 所有用户密码和本地一致
- 上传的截图不会同步，需要在正式环境重新上传
- 合同数据存在 localStorage，不会迁移到正式环境
