"""启动CRM测试服（独立控制台窗口）"""
import subprocess, sys, os, signal

port = sys.argv[1] if len(sys.argv) > 1 else "8081"
python = r"C:\Users\Administrator\.workbuddy\binaries\python\envs\default\Scripts\python.exe"
server = r"D:\gkdz\server.py"

# 先停掉同端口的老进程
try:
    out = subprocess.check_output(["netstat", "-ano"], text=True)
    for line in out.splitlines():
        if f":{port}" in line and "LISTENING" in line:
            pid = line.strip().split()[-1]
            try:
                os.kill(int(pid), 9)
                print(f"[OK] 已停止旧进程 PID={pid}")
            except:
                pass
except:
    pass

# 在新控制台窗口启动
env = os.environ.copy()
env["PORT"] = port
env["CRM_DB"] = "crm_test.db"

proc = subprocess.Popen(
    [python, server],
    env=env,
    creationflags=subprocess.CREATE_NEW_CONSOLE
)
print(f"[OK] 测试服已启动 (PID={proc.pid}) -> http://localhost:{port}")
print("  → 关闭弹出的控制台窗口即可停服")
