@echo off
chcp 65001 >nul
cls
echo ================================
echo   CRM 地址挂靠管理系统 - 正式版
echo   端口：8080 ^| 数据库：crm_shared.db
echo ================================
echo.
python server.py
pause
