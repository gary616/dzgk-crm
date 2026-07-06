"""
地址挂靠管理系统 - 共享数据后端
支持 SQLite（本地开发）和 PostgreSQL（线上部署）
基于 DATABASE_URL 环境变量自动切换
"""
import json, sqlite3, hashlib, datetime, os, time, threading, uuid, re, subprocess, tempfile
from flask import Flask, request, jsonify, g, send_from_directory, send_file, Response, stream_with_context
from flask_cors import CORS
import config as cfg

# ========== 速率限制（滑动窗口）==========
_RATE_LIMITS = {}  # key -> [(timestamp, count), ...]
_RATE_LOCK = threading.Lock()

def rate_limit(key_prefix, max_requests=5, window_seconds=60):
    """滑动窗口速率限制装饰器
    key_prefix: 限流键前缀（如 'login'）
    max_requests: 窗口内最大请求数
    window_seconds: 窗口大小（秒）
    返回 (allowed: bool, retry_after: int)
    """
    def decorator(f):
        def wrapper(*args, **kwargs):
            # 确定限流 key（IP + 前缀）
            ip = request.remote_addr or 'unknown'
            key = f'{key_prefix}:{ip}'
            now = time.time()
            
            with _RATE_LOCK:
                # 清理过期记录
                if key in _RATE_LIMITS:
                    _RATE_LIMITS[key] = [t for t in _RATE_LIMITS[key] if now - t < window_seconds]
                    if not _RATE_LIMITS[key]:
                        del _RATE_LIMITS[key]
                
                # 获取当前计数
                current_count = len(_RATE_LIMITS.get(key, []))
                
                if current_count >= max_requests:
                    # 计算需要等多久
                    oldest = min(_RATE_LIMITS[key])
                    retry_after = int(window_seconds - (now - oldest)) + 1
                    resp = jsonify({
                        'ok': False,
                        'error': f'请求过于频繁，请 {retry_after} 秒后重试'
                    })
                    resp.status_code = 429
                    resp.headers['Retry-After'] = str(retry_after)
                    return resp
                
                # 记录这次请求
                if key not in _RATE_LIMITS:
                    _RATE_LIMITS[key] = []
                _RATE_LIMITS[key].append(now)
            
            return f(*args, **kwargs)
        wrapper.__name__ = f.__name__
        return wrapper
    return decorator

try:
    from werkzeug.security import generate_password_hash, check_password_hash
except ImportError:
    # fallback: 简单的哈希（不依赖 werkzeug）
    import hashlib as _hashlib
    def generate_password_hash(pw): return 'sha256$' + _hashlib.sha256(pw.encode()).hexdigest()
    def check_password_hash(hash, pw):
        if hash.startswith('sha256$'): return hash[7:] == _hashlib.sha256(pw.encode()).hexdigest()
        return False  # 未知格式，拒绝登录

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'crm-default-secret-' + __file__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 上传文件最大 16MB
CORS(app, origins=["http://localhost:8080","http://localhost:8081","http://127.0.0.1:8080","http://127.0.0.1:8081"])

# 记录服务器启动时间（用于前端显示版本）
SERVER_START_TIME = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

app.config['START_TIME'] = SERVER_START_TIME

# 无需鉴权的路径前缀
_PUBLIC_PATHS = ['/api/login', '/api/session', '/api/ping', '/api/server-info', '/api/env', '/api/version', '/api/updates', '/api/events',
                 '/static/', '/uploads/']

# API 路径 → 所需权限映射（None = 仅需登录，无额外权限要求）
_API_PERMISSIONS = {
    '/api/addresses': 'address',
    '/api/sync/addresses': 'address',
    '/api/orders': 'orders',
    '/api/sync/orders': 'orders',
    '/api/customers': 'customers',
    '/api/sync/customers': 'customers',
    '/api/expenses': 'expenses',
    '/api/sync/expenses': 'expenses',
    '/api/users': 'users',
    '/api/sync/users': 'users',
    '/api/invoices': 'invoices',
    '/api/sync/invoices': 'invoices',
    '/api/notifications': None,  # None = 仅需登录
    '/api/sync/notifications': None,
    '/api/upload': None,  # None = 仅需登录，无需额外权限
}

# 仅管理员可访问的路径前缀
_ADMIN_ONLY_PREFIXES = ['/api/config', '/api/audit-logs']

@app.before_request
def require_auth():
    """除登录、静态文件外，所有 /api/ 接口需要 token 验证"""
    path = request.path
    # 只拦截 /api/ 路径
    if not path.startswith('/api/'):
        return
    # 白名单
    for p in _PUBLIC_PATHS:
        if path.startswith(p):
            return
    # CSRF 检查：非 GET 请求验证 Origin/Referer
    if request.method in ('POST', 'PUT', 'DELETE'):
        origin = request.headers.get('Origin', '')
        referer = request.headers.get('Referer', '')
        # 只检查有 origin 的请求（跨域请求）
        if origin:
            allowed = False
            for allowed_origin in ['http://localhost:8080', 'http://localhost:8081', 'http://127.0.0.1:8080',
                                     'http://127.0.0.1:8081', 'https://localhost:8080']:
                if origin.startswith(allowed_origin):
                    allowed = True
                    break
            if not allowed:
                return jsonify({'ok': False, 'error': '非法请求来源'}), 403
    # 验证 token
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        s = _verify_token(auth[7:])
        if s:
            # 将用户信息注入请求上下文
            g.current_user = s
            # 权限校验
            if not _check_api_permission(s):
                return jsonify({'ok': False, 'error': '权限不足，请联系管理员'}), 403
            return
    return jsonify({'ok': False, 'error': '未登录或登录已过期'}), 401

# 安全响应头
@app.after_request
def add_security_headers(resp):
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['X-Frame-Options'] = 'DENY'
    resp.headers['X-XSS-Protection'] = '1; mode=block'
    resp.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    # 仅生产环境启用 HSTS（开发环境 localhost 不用）
    if os.environ.get('ENV') == 'production':
        resp.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return resp

# ========== 全局错误处理 ==========
@app.errorhandler(400)
def bad_request(e):
    return jsonify({'ok': False, 'error': '请求格式错误，请检查输入数据'}), 400

@app.errorhandler(404)
def not_found(e):
    return jsonify({'ok': False, 'error': '请求的资源不存在'}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'ok': False, 'error': '不支持的请求方法'}), 405

@app.errorhandler(500)
def server_error(e):
    import traceback, sys
    print(f'[500错误] {type(e).__name__}: {e}', flush=True)
    traceback.print_exc(file=sys.stdout)
    sys.stdout.flush()
    return jsonify({'ok': False, 'error': f'服务器内部错误: {"服务器内部错误，请查看日志"}'}), 500

# 数据库配置：DATABASE_URL 存在时用 PostgreSQL，否则用 SQLite
DATABASE_URL = os.environ.get('DATABASE_URL', '')
IS_PG = DATABASE_URL.startswith('postgres')
CRM_DB = os.environ.get('CRM_DB', 'crm_shared.db')
DB_PATH = os.path.join(os.path.dirname(__file__), CRM_DB)

if IS_PG:
    import psycopg2
    import psycopg2.extras

# ========== 数据版本号机制（用于长轮询）==========
_data_version = 0          # 全局数据版本号
_table_versions = {}        # 按表版本号 {table: ver}
_TABLES = ['addresses', 'orders', 'customers', 'expenses', 'users', 'invoices', 'notifications']
_version_lock = threading.Lock()
_subscribers = []           # 等待通知的客户端队列 [(queue, timestamp)]
_subscribers_lock = threading.Lock()

# ========== Token 登录认证 ==========
_tokens = {}                # token -> {username, role, name, expiry}  (保留用于兼容，新增 token 使用 itsdangerous)
_TOKEN_EXPIRY = 86400       # 24小时过期
_TOKEN_SERIALIZER = None    # 延迟初始化

def _get_token_serializer():
    global _TOKEN_SERIALIZER
    if _TOKEN_SERIALIZER is None:
        from itsdangerous import URLSafeTimedSerializer
        _TOKEN_SERIALIZER = URLSafeTimedSerializer(app.secret_key, salt='crm-auth')
    return _TOKEN_SERIALIZER

def _get_current_username():
    """从请求上下文获取当前用户名"""
    try:
        if hasattr(g, 'current_user') and g.current_user:
            return g.current_user.get('username', 'system')
    except RuntimeError:
        pass  # 不在请求上下文中
    # 兜底：从请求头解析
    try:
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            s = _verify_token(auth[7:])
            if s:
                return s.get('username', 'system')
    except RuntimeError:
        pass
    return 'system'

def _log_audit(action, table_name, item_id=None, summary='', username=None):
    """写入操作日志（使用 AUTOINCREMENT ID）"""
    try:
        if username is None:
            username = _get_current_username()
        now = datetime.datetime.now().isoformat()
        q('INSERT INTO audit_log (ts, username, action, table_name, item_id, summary) VALUES (?, ?, ?, ?, ?, ?)',
          [now, username, action, table_name, str(item_id) if item_id is not None else '', summary])
        get_db().commit()
    except Exception as e:
        print(f'[audit] 写入失败: {e}')

def _strip_password(user_dict):
    """返回不包含 password 字段的用户信息"""
    return {k: v for k, v in user_dict.items() if k != 'password'}

def _check_api_permission(session_user):
    """检查当前用户是否有权访问当前 API 路径"""
    path = request.path
    method = request.method

    # 管理员/总经理拥有所有权限
    if session_user.get('role') in ('admin', 'gm'):
        return True

    # 管理员专用路径
    for prefix in _ADMIN_ONLY_PREFIXES:
        if path.startswith(prefix):
            return False

    # 查找路径对应的权限
    req_perm = None
    matched = False
    for api_path, perm in _API_PERMISSIONS.items():
        if path.startswith(api_path):
            req_perm = perm
            matched = True
            break

    if not matched:
        # 未在映射表中的 /api/ 路径，默认仅允许 admin
        return False

    # 路径在映射表中但权限为 None，仅需登录即可
    if req_perm is None:
        return True

    # 从数据库获取最新用户权限
    try:
        db = get_db()
        rows = q("SELECT data FROM users WHERE json_extract(data, '$.username') = ?",
                 [session_user['username']]).fetchall()
        if rows:
            user_data = row_to_data(rows)[0]
            perms = user_data.get('permissions') or []
            return req_perm in perms
    except Exception:
        pass

    # 兜底：用 session 中的权限列表
    return req_perm in (session_user.get('permissions') or [])

def _verify_token(token):
    """验证 token，返回用户信息或 None
    优先使用 itsdangerous 签名 token（服务重启不丢失），
    回退到内存 _tokens 字典（兼容旧 token）"""
    # 尝试 itsdangerous 签名 token
    try:
        s = _get_token_serializer()
        data = s.loads(token, max_age=_TOKEN_EXPIRY)
        return data
    except Exception:
        pass
    # 回退：旧的 uuid 内存 token
    s = _tokens.get(token)
    if not s:
        return None
    if time.time() > s['expiry']:
        del _tokens[token]
        return None
    return s

def _migrate_passwords():
    """将数据库中所有明文密码迁移为哈希密码"""
    db = get_db()
    rows = q('SELECT id, data FROM users').fetchall()
    if IS_PG:
        rows = [(r[0], json.loads(r[1])) for r in rows]
    else:
        rows = [(r['id'], json.loads(r['data'])) for r in rows]
    for uid, data in rows:
        pw = data.get('password', '')
        if pw and not pw.startswith('pbkdf2:') and not pw.startswith('sha256$') and not pw.startswith('scrypt:'):
            data['password'] = generate_password_hash(pw)
            q('UPDATE users SET data=?, updated_at=? WHERE id=?',
              [json.dumps(data, ensure_ascii=False), datetime.datetime.now().isoformat(), uid])

def get_data_version():
    """获取当前数据版本号"""
    with _version_lock:
        return _data_version

def get_all_data(db=None):
    """获取当前全量数据快照，用于长轮询返回"""
    if db is None:
        db = get_db()
    return {
        'addresses': row_to_data(q('SELECT data FROM addresses').fetchall()),
        'orders': row_to_data(q('SELECT data FROM orders').fetchall()),
        'customers': row_to_data(q('SELECT data FROM customers').fetchall()),
        'expenses': row_to_data(q('SELECT data FROM expenses').fetchall()),
        'users': row_to_data(q('SELECT data FROM users').fetchall()),
    }

def bump_version(table=None, item_id=None):
    """数据变更时递增版本号，并唤醒所有等待的长轮询"""
    global _data_version
    with _version_lock:
        _data_version += 1
        ver = _data_version
        # 按表递增版本
        if table:
            _table_versions[table] = _table_versions.get(table, 0) + 1
    # 同步索引字段
    if table and item_id is not None:
        _sync_extracted_fields(table, item_id)
    now = time.time()
    # 通知所有等待的客户端，同时清理过期连接
    with _subscribers_lock:
        active = []
        for entry in list(_subscribers):
            q_obj = entry[0] if isinstance(entry, tuple) else entry
            try:
                q_obj.put(ver)
                active.append(entry)
            except:
                pass  # 队列已关闭，丢弃
        # 只保留60秒内的活跃连接
        _subscribers.clear()
        for entry in active:
            ts = entry[1] if isinstance(entry, tuple) else now
            if now - ts < 60:
                _subscribers.append(entry)



def q(sql, params=None):
    """统一的参数化查询，自动适配 SQLite(?) / PostgreSQL(%s)"""
    db = get_db()
    if IS_PG:
        sql = sql.replace('?', '%s')
    if params is None:
        return db.execute(sql)
    return db.execute(sql, params)



def get_db():
    if 'db' not in g:
        if IS_PG:
            g.db = psycopg2.connect(DATABASE_URL)
            g.db.autocommit = False
        else:
            g.db = sqlite3.connect(DB_PATH)
            g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    db = get_db()
    if IS_PG:
        q('''
        CREATE TABLE IF NOT EXISTS addresses (
            id BIGINT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )''')
        q('''
        CREATE TABLE IF NOT EXISTS orders (
            id BIGINT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )''')
        q('''
        CREATE TABLE IF NOT EXISTS customers (
            id BIGINT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )''')
        q('''
        CREATE TABLE IF NOT EXISTS expenses (
            id BIGINT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )''')
        q('''
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )''')
        q('''
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )''')
        q('''
        CREATE TABLE IF NOT EXISTS audit_log (
            id BIGINT PRIMARY KEY,
            ts TEXT NOT NULL,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            table_name TEXT NOT NULL,
            item_id TEXT,
            summary TEXT
        )''')
        q('''
        CREATE TABLE IF NOT EXISTS invoices (
            id BIGINT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id BIGINT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )''')
        db.commit()
    else:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS addresses (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            table_name TEXT NOT NULL,
            item_id TEXT,
            summary TEXT
        );
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        ''')
        db.commit()

    # 如果用户表为空，仅初始化基础用户（保证能登录），不再 seed 演示业务数据
    now = datetime.datetime.now().isoformat()
    cur = q('SELECT COUNT(*) FROM users').fetchone()
    if cur[0] == 0:
        _seed_users(db, now)
        db.commit()
        print('  首次启动，已初始化基础用户账号')
    else:
        # 已有数据时也执行迁移，补全新字段
        migrate_users(db, now)
        _migrate_passwords()
        db.commit()

    # 规范化迁移：添加索引列（首次运行会执行，后续自动跳过已存在的列）
    _migrate_normalize_columns()

def _seed_addresses(db, now):
    addrs = [
        {"id":1,"t":"九环路31-1号","ad":"九环路31-1号3幢3楼","rm":"324室","bn":"G-202604001","sl":"高恩伟","ac":"GEW","nn":"谢繁荣","rt":"个体户","co":"杭州市上城区弦墨设计服务工作室","sd":"2025-03-15","ed":"2026-03-14","pd":"2026-03-14","pa":"大管家","pm":700,"lp":"朱锐","ph":"18652390000","cs":200,"rs":"需要续费","ex":"否","rk":""},
        {"id":2,"t":"九环路31-1号","ad":"九环路31-1号3幢3楼","rm":"325室","bn":"","sl":"","ac":"","nn":"","rt":"","co":"","sd":"","ed":"","pd":"","pa":"","pm":0,"lp":"","ph":"","cs":0,"rs":"无需续费","ex":"否","rk":"空置"},
        {"id":3,"t":"九环路31-1号","ad":"九环路31-1号3幢3楼","rm":"326室","bn":"G-202604002","sl":"高恩伟","ac":"GEW","nn":"谢繁荣","rt":"个体户","co":"杭州市上城区哈哈设计服务工作室","sd":"2025-04-16","ed":"2026-04-15","pd":"2025-04-16","pa":"大管家","pm":700,"lp":"倪慧","ph":"18652310000","cs":200,"rs":"需要续费","ex":"否","rk":""},
        {"id":4,"t":"鑫运时代金座","ad":"鑫运时代金座6幢609室","rm":"A22","bn":"YKK-202604001","sl":"虞柯柯","ac":"大管家虞","nn":"源头","rt":"公司","co":"杭州春暖花开科技有限公司","sd":"2025-04-14","ed":"2026-04-13","pd":"2025-04-16","pa":"兴亚","pm":500,"lp":"王芳","ph":"13812340000","cs":100,"rs":"需要续费","ex":"是","rk":"到期超2个月"},
        {"id":5,"t":"九环路31-1号","ad":"九环路31-1号3幢3楼","rm":"328室","bn":"G-202603001","sl":"高恩伟","ac":"GEW","nn":"张伟","rt":"个体户","co":"杭州星河创意设计工作室","sd":"2025-03-01","ed":"2026-02-28","pd":"2025-03-01","pa":"大管家","pm":700,"lp":"张伟","ph":"15912340000","cs":200,"rs":"无需续费","ex":"否","rk":""},
        {"id":6,"t":"鑫运时代金座","ad":"鑫运时代金座6幢609室","rm":"A15","bn":"YKK-202602001","sl":"虞柯柯","ac":"大管家虞","nn":"小李","rt":"公司","co":"杭州明日科技有限公司","sd":"2025-02-01","ed":"2026-01-31","pd":"2025-02-01","pa":"兴亚","pm":600,"lp":"李明","ph":"13701230000","cs":150,"rs":"需要续费","ex":"否","rk":""},
        {"id":7,"t":"九环路31-1号","ad":"九环路31-1号4幢2楼","rm":"201室","bn":"G-202601001","sl":"李明华","ac":"LMH","nn":"陈总","rt":"个体户","co":"杭州陈记装饰服务工作室","sd":"2025-01-10","ed":"2026-01-09","pd":"2025-01-10","pa":"大管家","pm":700,"lp":"陈建国","ph":"13500000001","cs":200,"rs":"需要续费","ex":"否","rk":""},
        {"id":8,"t":"鑫运时代金座","ad":"鑫运时代金座8幢301室","rm":"B05","bn":"YKK-202512001","sl":"虞柯柯","ac":"大管家虞","nn":"赵大","rt":"公司","co":"杭州赵氏贸易有限公司","sd":"2024-12-15","ed":"2025-12-14","pd":"2024-12-15","pa":"兴亚","pm":500,"lp":"赵大强","ph":"13600000002","cs":100,"rs":"需要续费","ex":"是","rk":"超期未续"},
    ]
    for a in addrs:
        q('INSERT INTO addresses (id, data, updated_at) VALUES (?, ?, ?)', [a['id'], json.dumps(a, ensure_ascii=False), now])

def _seed_customers(db, now):
    custs = [
        {"id":1,"co":"杭州极氪小草集团","nn":"谢繁荣","wx":"Kun-Kun27","ac":"GEW","fd":"2024-08-24","dy":598,"tp":"老客户","sl":"高恩伟"},
        {"id":2,"co":"杭州宁职财税有限公司","nn":"源头","wx":"XXX1123","ac":"大管家虞","fd":"2026-04-13","dy":1,"tp":"新客户","sl":"虞柯柯"},
        {"id":3,"co":"杭州春暖花开科技有限公司","nn":"源头","wx":"XXX1123","ac":"大管家虞","fd":"2025-04-14","dy":365,"tp":"老客户","sl":"虞柯柯"},
        {"id":4,"co":"杭州星河创意设计工作室","nn":"张伟","wx":"zhangwei88","ac":"GEW","fd":"2025-03-01","dy":400,"tp":"老客户","sl":"高恩伟"},
        {"id":5,"co":"杭州明日科技有限公司","nn":"小李","wx":"xiaoli666","ac":"大管家虞","fd":"2025-02-01","dy":430,"tp":"老客户","sl":"虞柯柯"},
        {"id":6,"co":"杭州陈记装饰服务工作室","nn":"陈总","wx":"chenjian01","ac":"LMH","fd":"2025-01-10","dy":450,"tp":"老客户","sl":"李明华"},
        {"id":7,"co":"杭州赵氏贸易有限公司","nn":"赵大","wx":"zhao_big","ac":"大管家虞","fd":"2024-12-15","dy":120,"tp":"老客户","sl":"虞柯柯"},
        {"id":8,"co":"杭州新锐设计工作室","nn":"王小红","wx":"wangxh2025","ac":"GEW","fd":"2026-04-10","dy":4,"tp":"新客户","sl":"高恩伟"},
    ]
    for c in custs:
        q('INSERT INTO customers (id, data, updated_at) VALUES (?, ?, ?)', [c['id'], json.dumps(c, ensure_ascii=False), now])

def _seed_orders(db, now):
    orders = [
        {"id":1,"od":"2026-04-15","bt":"地址销售","sl":"高恩伟","ac":"GEW","bn":"G-202604001","rt":"个体户","co":"杭州市上城区弦墨设计服务工作室","ad":"九环路31-1号3幢3楼324室","sd":"2025-03-15","ed":"2026-03-14","pr":700,"pd":"2025-04-14","pa":"大管家","pm":700,"cs":200,"profit":500,"nn":"谢繁荣","wx":"Kun-Kun27","ct":"老客户","rk":"","nq":"盛佳缘","pg":"已办结","ap":"approved","items":[{"addr":"九环路31-1号3幢3楼324室","rt":"个体户","sd":"2025-03-15","ed":"2026-03-14","pr":700,"pd":"2025-04-14","pa":"大管家","pm":700,"cost":200,"profit":500,"itemStatus":"approved"}]},
        {"id":2,"od":"2026-04-16","bt":"地址销售","sl":"高恩伟","ac":"GEW","bn":"G-202604002","rt":"个体户","co":"杭州市上城区哈哈设计服务工作室","ad":"九环路31-1号3幢3楼326室","sd":"2025-04-16","ed":"2026-04-15","pr":700,"pd":"2025-04-16","pa":"大管家","pm":700,"cs":200,"profit":500,"nn":"谢繁荣","wx":"Kun-Kun27","ct":"老客户","rk":"","nq":"盛佳缘","pg":"已办结","ap":"approved","items":[{"addr":"九环路31-1号3幢3楼326室","rt":"个体户","sd":"2025-04-16","ed":"2026-04-15","pr":700,"pd":"2025-04-16","pa":"大管家","pm":700,"cost":200,"profit":500,"itemStatus":"approved"}]},
        {"id":3,"od":"2025-12-25","bt":"地址续费","sl":"虞柯柯","ac":"大管家虞","bn":"YKK-202604001","rt":"公司","co":"杭州春暖花开科技有限公司","ad":"鑫运时代金座6幢609室A22","sd":"2025-04-14","ed":"2026-04-13","pr":500,"pd":"2025-04-16","pa":"兴亚","pm":500,"cs":100,"profit":400,"nn":"源头","wx":"XXX1123","ct":"新客户","rk":"","nq":"童清清","pg":"已办结","ap":"approved","items":[{"addr":"鑫运时代金座6幢609室A22","rt":"公司","sd":"2025-04-14","ed":"2026-04-13","pr":500,"pd":"2025-04-16","pa":"兴亚","pm":500,"cost":100,"profit":400,"itemStatus":"approved"}]},
        {"id":4,"od":"2026-03-20","bt":"地址销售","sl":"高恩伟","ac":"GEW","bn":"G-202603001","rt":"个体户","co":"杭州星河创意设计工作室","ad":"九环路31-1号3幢3楼328室","sd":"2025-03-01","ed":"2026-02-28","pr":700,"pd":"2025-03-01","pa":"大管家","pm":700,"cs":200,"profit":500,"nn":"张伟","wx":"zhangwei88","ct":"老客户","rk":"","nq":"盛佳缘","pg":"已办结","ap":"approved","items":[{"addr":"九环路31-1号3幢3楼328室","rt":"个体户","sd":"2025-03-01","ed":"2026-02-28","pr":700,"pd":"2025-03-01","pa":"大管家","pm":700,"cost":200,"profit":500,"itemStatus":"approved"}]},
        {"id":5,"od":"2026-02-10","bt":"地址销售","sl":"虞柯柯","ac":"大管家虞","bn":"YKK-202602001","rt":"公司","co":"杭州明日科技有限公司","ad":"鑫运时代金座6幢609室A15","sd":"2025-02-01","ed":"2026-01-31","pr":600,"pd":"2025-02-01","pa":"兴亚","pm":600,"cs":150,"profit":450,"nn":"小李","wx":"xiaoli666","ct":"老客户","rk":"","nq":"童清清","pg":"已办结","ap":"approved","items":[{"addr":"鑫运时代金座6幢609室A15","rt":"公司","sd":"2025-02-01","ed":"2026-01-31","pr":600,"pd":"2025-02-01","pa":"兴亚","pm":600,"cost":150,"profit":450,"itemStatus":"approved"}]},
        {"id":6,"od":"2026-01-15","bt":"地址销售","sl":"李明华","ac":"LMH","bn":"G-202601001","rt":"个体户","co":"杭州陈记装饰服务工作室","ad":"九环路31-1号4幢2楼201室","sd":"2025-01-10","ed":"2026-01-09","pr":700,"pd":"2025-01-10","pa":"大管家","pm":700,"cs":200,"profit":500,"nn":"陈总","wx":"chenjian01","ct":"老客户","rk":"","nq":"盛佳缘","pg":"已办结","ap":"approved","items":[{"addr":"九环路31-1号4幢2楼201室","rt":"个体户","sd":"2025-01-10","ed":"2026-01-09","pr":700,"pd":"2025-01-10","pa":"大管家","pm":700,"cost":200,"profit":500,"itemStatus":"approved"}]},
        {"id":7,"od":"2026-04-01","bt":"地址续费","sl":"高恩伟","ac":"GEW","bn":"G-202604003","rt":"个体户","co":"杭州新锐设计工作室","ad":"九环路31-1号3幢3楼327室","sd":"2026-04-01","ed":"2027-03-31","pr":700,"pd":"2026-04-01","pa":"大管家","pm":700,"cs":200,"profit":500,"nn":"王小红","wx":"wangxh2025","ct":"新客户","rk":"","nq":"盛佳缘","pg":"跟进中","ap":"","items":[{"addr":"九环路31-1号3幢3楼327室","rt":"个体户","sd":"2026-04-01","ed":"2027-03-31","pr":700,"pd":"2026-04-01","pa":"大管家","pm":700,"cost":200,"profit":500}]},
        {"id":8,"od":"2025-12-20","bt":"地址销售","sl":"虞柯柯","ac":"大管家虞","bn":"YKK-202512001","rt":"公司","co":"杭州赵氏贸易有限公司","ad":"鑫运时代金座8幢301室B05","sd":"2024-12-15","ed":"2025-12-14","pr":500,"pd":"2024-12-15","pa":"兴亚","pm":500,"cs":100,"profit":400,"nn":"赵大","wx":"zhao_big","ct":"老客户","rk":"","nq":"童清清","pg":"待处理","ap":"","items":[{"addr":"鑫运时代金座8幢301室B05","rt":"公司","sd":"2024-12-15","ed":"2025-12-14","pr":500,"pd":"2024-12-15","pa":"兴亚","pm":500,"cost":100,"profit":400}]},
    ]
    for o in orders:
        q('INSERT INTO orders (id, data, updated_at) VALUES (?, ?, ?)', [o['id'], json.dumps(o, ensure_ascii=False), now])

def _seed_expenses(db, now):
    expenses = [
        {"id":1,"xd":"2025-04-14","bn":"G-202604001","sl":"高恩伟","co":"杭州市上城区弦墨设计服务工作室","xa":"7918","xt":"CJG","xm":100,"cs":200,"pa":"大管家","pm":700,"bt":"地址销售","rk":""},
        {"id":4,"xd":"2025-03-01","bn":"G-202603001","sl":"高恩伟","co":"杭州星河创意设计工作室","xa":"7918","xt":"CJG","xm":100,"cs":200,"pa":"大管家","pm":700,"bt":"地址销售","rk":""},
        {"id":6,"xd":"2025-01-10","bn":"G-202601001","sl":"李明华","co":"杭州陈记装饰服务工作室","xa":"7918","xt":"CJG","xm":100,"cs":200,"pa":"大管家","pm":700,"bt":"地址销售","rk":""},
    ]
    for e in expenses:
        q('INSERT INTO expenses (id, data, updated_at) VALUES (?, ?, ?)', [e['id'], json.dumps(e, ensure_ascii=False), now])

def _seed_users(db, now):
    users = [
        {"username":"admin","password":generate_password_hash("admin123"),"role":"admin","name":"管理员","avatar":"A","code":"ADM","createdAt":"2026-01-01","lastLogin":None,"account":"","permissions":['address','orders','customers','renew','approval','performance','income','expenses','users','invoices']},
        {"username":"sales01","password":generate_password_hash("123456"),"role":"sales","name":"高恩伟","avatar":"高","code":"GEW","createdAt":"2026-01-01","lastLogin":None,"account":"GEW","permissions":['address','orders','customers','renew','performance','invoices']},
        {"username":"sales02","password":generate_password_hash("123456"),"role":"sales","name":"虞柯柯","avatar":"虞","code":"YKK","createdAt":"2026-01-01","lastLogin":None,"account":"大管家虞","permissions":['address','orders','customers','renew','performance','invoices']},
        {"username":"neiqin01","password":generate_password_hash("123456"),"role":"neiqin","name":"盛佳缘","avatar":"盛","code":"SJY","createdAt":"2026-01-01","lastLogin":None,"account":"","permissions":['address','orders','approval','invoices']},
        {"username":"neiqin02","password":generate_password_hash("123456"),"role":"neiqin","name":"童清清","avatar":"童","code":"TQQ","createdAt":"2026-01-01","lastLogin":None,"account":"","permissions":['address','orders','approval','invoices']},
        {"username":"finance01","password":generate_password_hash("123456"),"role":"finance","name":"财务专员","avatar":"财","code":"CW","createdAt":"2026-01-01","lastLogin":None,"account":"","permissions":['approval','income','expenses','invoices']},
    ]
    for i, u in enumerate(users):
        q('INSERT INTO users (id, data, updated_at) VALUES (?, ?, ?)', [i+1, json.dumps(u, ensure_ascii=False), now])

def migrate_users(db, now):
    """迁移已有用户数据，补全 code、permissions 等新字段"""
    rows = q('SELECT id, data FROM users').fetchall()
    code_map = {'sales01':'GEW','sales02':'YKK','neiqin01':'SJY','neiqin02':'TQQ','finance01':'CW','admin':'ADM'}
    sales_inv_perms = ['address','orders','customers','renew','performance','invoices']
    for r in rows:
        u = json.loads(r['data'])
        changed = False
        if 'code' not in u or not u['code']:
            u['code'] = code_map.get(u.get('username',''), u.get('name','')[0] if u.get('name') else '')
            changed = True
        # 给销售用户补上 invoices 权限（用于申请开票）
        if u.get('role') == 'sales' and 'invoices' not in (u.get('permissions') or []):
            u['permissions'] = sales_inv_perms
            changed = True
        # 修复内勤/财务的 invoice→invoices（单复数不一致）
        perms = u.get('permissions') or []
        if 'invoice' in perms and 'invoices' not in perms:
            perms.remove('invoice')
            perms.append('invoices')
            u['permissions'] = perms
            changed = True
        # 给财务补上 invoices 权限（可申请开票）
        if u.get('role') == 'finance' and 'invoices' not in (u.get('permissions') or []):
            u.setdefault('permissions', []).append('invoices')
            changed = True
        # 给内勤补上 invoices 权限（可申请开票）
        if u.get('role') == 'neiqin' and 'invoices' not in (u.get('permissions') or []):
            u.setdefault('permissions', []).append('invoices')
            changed = True
        # 给 gm 用户设置默认密码
        if u.get('username') == 'gm01' and (not u.get('password') or u['password'] == ''):
            u['password'] = generate_password_hash('gm123')
            if not u.get('permissions'):
                u['permissions'] = ['address','orders','customers','renew','approval','performance','income','expenses','invoices']
            changed = True
        if changed:
            q('UPDATE users SET data=?, updated_at=? WHERE id=?', [json.dumps(u, ensure_ascii=False), now, r['id']])

    # 修复订单 items 中 pr 字段为非数组的问题
    _fix_order_pr_field(now)

def _fix_order_pr_field(now):
    """迁移：修复订单子项中 pr 字段不是数组的问题"""
    rows = q('SELECT id, data FROM orders').fetchall()
    for r in rows:
        o = json.loads(r['data']) if not IS_PG else json.loads(r[0])
        changed = False
        if 'items' in o and isinstance(o['items'], list):
            for it in o['items']:
                if 'pr' in it and it['pr'] is not None and not isinstance(it['pr'], list):
                    it['pr'] = [it['pr']]  # 转为数组
                    changed = True
        if changed:
            q('UPDATE orders SET data=?, updated_at=? WHERE id=?', [json.dumps(o, ensure_ascii=False), now, r['id']])

def _calc_profit(pr, cs):
    """计算利润 = 价格 - 成本"""
    try:
        return int(pr) - int(cs)
    except (TypeError, ValueError):
        return 0

def row_to_data(rows):
    if IS_PG:
        return [json.loads(r['data']) for r in rows]
    return [json.loads(r['data']) for r in rows]

def _migrate_normalize_columns():
    """规范化迁移：给 JSON-in-column 表添加索引列并回填数据（幂等）"""
    if IS_PG:
        return  # PostgreSQL 暂不处理，可后续用 PG 的 JSONB 路径索引
    db = get_db()
    tables = {
        'addresses': [('bn','TEXT'),('co','TEXT'),('sl','TEXT'),('nn','TEXT')],
        'orders': [('bn','TEXT'),('sl','TEXT'),('nn','TEXT')],
        'customers': [('nn','TEXT'),('co','TEXT'),('wx','TEXT'),('sl','TEXT')],
        'invoices': [('bn','TEXT'),('status','TEXT'),('salesperson','TEXT'),('appliedBy','TEXT')],
        'expenses': [('bn','TEXT'),('sl','TEXT')],
        'notifications': [('targetUser','TEXT'),('type','TEXT'),('read','INTEGER DEFAULT 0')],
    }
    field_map = {
        'addresses': ['bn','co','sl','nn'],
        'orders': ['bn','sl','nn'],
        'customers': ['nn','co','wx','sl'],
        'invoices': ['bn','status','salesperson','appliedBy'],
        'expenses': ['bn','sl'],
        'notifications': ['targetUser','type','read'],
    }
    for table, cols in tables.items():
        added = 0
        for col_name, col_type in cols:
            try:
                db.execute(f'ALTER TABLE {table} ADD COLUMN {col_name} {col_type}')
                added += 1
            except:
                pass
        # 回填数据
        fields = field_map[table]
        rows = db.execute(f'SELECT id, data FROM {table}').fetchall()
        backfilled = 0
        for row in rows:
            try:
                d = json.loads(row['data'])
                vals = []
                for f in fields:
                    v = d.get(f, '')
                    if f == 'read':
                        v = 1 if d.get('read') else 0
                    vals.append(v)
                placeholders = ','.join(['=?'] * len(fields))
                set_clause = ', '.join([f'{f}=?' for f in fields])
                db.execute(f'UPDATE {table} SET {set_clause} WHERE id=?', vals + [row['id']])
                backfilled += 1
            except:
                pass
        # 创建索引
        for col_name, _ in cols:
            try:
                db.execute(f'CREATE INDEX IF NOT EXISTS idx_{table[:4]}_{col_name} ON {table}({col_name})')
            except:
                pass
        print(f'  [迁移] {table}: 添加{added}列, 回填{backfilled}条')
    db.commit()

def _sync_extracted_fields(table, item_id):
    """将 JSON data 中的关键字段同步到索引列"""
    if IS_PG:
        return
    try:
        db = get_db()
        row = db.execute(f'SELECT data FROM {table} WHERE id=?', [item_id]).fetchone()
        if not row:
            return
        d = json.loads(row['data'])
        field_map = {
            'addresses': [('bn','bn'),('co','co'),('sl','sl'),('nn','nn')],
            'orders': [('bn','bn'),('sl','sl'),('nn','nn')],
            'customers': [('nn','nn'),('co','co'),('wx','wx'),('sl','sl')],
            'invoices': [('bn','bn'),('status','status'),('salesperson','salesperson'),('appliedBy','appliedBy')],
            'expenses': [('bn','bn'),('sl','sl')],
            'notifications': [('targetUser','targetUser'),('type','type'),('read','read')],
        }
        if table not in field_map:
            return
        sets = []
        vals = []
        for json_key, col in field_map[table]:
            v = d.get(json_key, '')
            if col == 'read':
                v = 1 if d.get('read') else 0
            sets.append(f'{col}=?')
            vals.append(v)
        vals.append(item_id)
        db.execute(f'UPDATE {table} SET {",".join(sets)} WHERE id=?', vals)
        db.commit()
    except Exception as e:
        print(f'[sync_extracted] {table}#{item_id}: {e}')

# ========== 数据读写接口 ==========

@app.route('/api/addresses', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_addresses():
    db = get_db()
    if request.method == 'GET':
        rows = q('SELECT data FROM addresses').fetchall()
        return jsonify(row_to_data(rows))

    elif request.method == 'POST':
        # 新增单条记录
        item = request.get_json(force=True)
        if not item:
            return jsonify({'error': 'no data'}), 400
        # 数据校验：地址、房间号、单位至少填一个
        if not item.get('ad') and not item.get('rm') and not item.get('co'):
            return jsonify({'error': '地址、房间号和单位名称不能同时为空'}), 400
        if 'pr' in item and item['pr'] is not None:
            try:
                if float(item['pr']) < 0: return jsonify({'error': '参考价不能为负数'}), 400
            except: pass
        if 'cs' in item and item['cs'] is not None:
            try:
                if float(item['cs']) < 0: return jsonify({'error': '成本不能为负数'}), 400
            except: pass
        now = datetime.datetime.now().isoformat()
        cur = q('SELECT COALESCE(MAX(id), 0) FROM addresses')
        max_id = cur.fetchone()[0]
        new_id = (max_id or 0) + 1
        item['id'] = new_id
        q('INSERT INTO addresses (id, data, updated_at) VALUES (?, ?, ?)',
                   [new_id, json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version('addresses', new_id)
        _log_audit('create', 'addresses', str(new_id), f'新增地址: ' + str(item.get('name') or item.get('co') or item.get('username') or item.get('bn') or item.get('ad') or item.get('xd') or '')[:60])
        return jsonify({'ok': True, 'id': new_id})
    elif request.method == 'PUT':
        item = request.json
        if not item:
            return jsonify({'error': 'no data'}), 400
        now = datetime.datetime.now().isoformat()
        q('''
            INSERT INTO addresses (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        '''.replace('?', '%s') if IS_PG else '''
            INSERT INTO addresses (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        ''',
                   [item['id'], json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version('addresses', item['id'])   # ★
        _log_audit('update', 'addresses', str(item.get('id','')), '更新地址 #' + str(item.get('id',''))[:60])
        return jsonify({'ok': True})

    elif request.method == 'DELETE':
        id_ = request.json.get('id') if request.is_json else request.args.get('id')
        if id_:
            # 读取删除前的数据，记录日志
            rows = q('SELECT data FROM addresses WHERE id = ?', [int(id_)]).fetchall()
            if rows:
                item = json.loads(rows[0]['data']) if not IS_PG else json.loads(rows[0][0])
                _log_audit('delete', 'addresses', id_, f'地址: {item.get("ad","")} {item.get("rm","")} - {item.get("co","")}')
            q('DELETE FROM addresses WHERE id = ?', [int(id_)])
            db.commit()
            bump_version()  # ★
        return jsonify({'ok': True})
    return jsonify({'ok': True, 'deleted': False})

@app.route('/api/orders', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_orders():
    db = get_db()
    if request.method == 'GET':
        rows = q('SELECT data FROM orders').fetchall()
        return jsonify(row_to_data(rows))

    elif request.method == 'POST':
        # 新增单条记录
        item = request.get_json(force=True)
        if not item:
            return jsonify({'error': 'no data'}), 400
        
        # 必填字段验证
        required = ['bn', 'sl']
        for field in required:
            if not item.get(field):
                return jsonify({'ok': False, 'error': f'缺少必填字段: {field}'}), 400
        
        now = datetime.datetime.now().isoformat()
        
        # 自动计算利润（先算再存）
        pm = int(item.get('pm', 0) or 0)
        cs = int(item.get('cs', 0) or 0)
        item['profit'] = pm - cs
        if item.get('items'):
            for sub in item['items']:
                sub_pm = int(sub.get('pm', 0) or 0)
                sub_cs = int(sub.get('cost', 0) or 0)
                sub['profit'] = sub_pm - sub_cs
        
        cur = q('SELECT COALESCE(MAX(id), 0) FROM orders')
        max_id = cur.fetchone()[0]
        new_id = (max_id or 0) + 1
        item['id'] = new_id
        q('INSERT INTO orders (id, data, updated_at) VALUES (?, ?, ?)',
                   [new_id, json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version('orders', new_id)
        _log_audit('create', 'orders', str(new_id), f'新增订单: ' + str(item.get('name') or item.get('co') or item.get('username') or item.get('bn') or item.get('ad') or item.get('xd') or '')[:60])
        
        return jsonify({'ok': True, 'id': new_id})
    elif request.method == 'PUT':
        item = request.get_json(force=True)
        if not item:
            return jsonify({'error': 'no data'}), 400
        now = datetime.datetime.now().isoformat()
        # 自动计算利润
        pm = int(item.get('pm', 0) or 0)
        cs = int(item.get('cs', 0) or 0)
        item['profit'] = pm - cs
        if item.get('items'):
            for sub in item['items']:
                sub_pm = int(sub.get('pm', 0) or 0)
                sub_cs = int(sub.get('cost', 0) or 0)
                sub['profit'] = sub_pm - sub_cs
        q('''
            INSERT INTO orders (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        '''.replace('?', '%s') if IS_PG else '''
            INSERT INTO orders (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        ''',
                   [item['id'], json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version('orders', item['id'])   # ★
        _log_audit('update', 'orders', str(item.get('id','')), '更新订单 #' + str(item.get('id',''))[:60])
        
        # 订单审批通过 → 联动更新地址的到期日和续费状态
        try:
            if item.get('ap') == 'approved' and item.get('ad'):
                rows = q('SELECT id, data FROM addresses').fetchall()
                for r in rows:
                    addr = json.loads(r['data'])
                    # 精确匹配地址
                    addr_full = (addr.get('ad','') + ' ' + addr.get('rm','')).replace(' ','')
                    order_addr = item.get('ad','').replace(' ','')
                    if order_addr and addr_full == order_addr:
                        # 更新到期日
                        if item.get('ed'):
                            addr['ed'] = item['ed']
                        if item.get('bn'):
                            addr['bn'] = item['bn']
                        addr['rs'] = '无需续费'  # 刚续费，不需要再续
                        q('''
                            INSERT INTO addresses (id, data, updated_at) VALUES (?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
                        '''.replace('?', '%s') if IS_PG else '''
                            INSERT INTO addresses (id, data, updated_at) VALUES (?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
                        ''', [addr['id'], json.dumps(addr, ensure_ascii=False), now])
                        break
        except Exception as e:
            print(f'[联动] 订单→地址更新失败: {e}')
        
        return jsonify({'ok': True})

    elif request.method == 'DELETE':
        id_ = request.get_json(force=True).get('id') if request.is_json else request.args.get('id')
        if id_:
            rows = q('SELECT data FROM orders WHERE id = ?', [int(id_)]).fetchall()
            if rows:
                item = json.loads(rows[0]['data']) if not IS_PG else json.loads(rows[0][0])
                _log_audit('delete', 'orders', id_, f'订单: {item.get("bn","")} - {item.get("co","")}')
            q('DELETE FROM orders WHERE id = ?', [int(id_)])
            db.commit()
            bump_version()  # ★
        return jsonify({'ok': True})
    return jsonify({'ok': True, 'deleted': False})

@app.route('/api/customers', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_customers():
    db = get_db()
    if request.method == 'GET':
        rows = q('SELECT data FROM customers').fetchall()
        return jsonify(row_to_data(rows))

    elif request.method == 'POST':
        # 新增单条记录
        item = request.get_json(force=True)
        if not item:
            return jsonify({'error': 'no data'}), 400
        now = datetime.datetime.now().isoformat()
        cur = q('SELECT COALESCE(MAX(id), 0) FROM customers')
        max_id = cur.fetchone()[0]
        new_id = (max_id or 0) + 1
        item['id'] = new_id
        q('INSERT INTO customers (id, data, updated_at) VALUES (?, ?, ?)',
                   [new_id, json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version('customers', new_id)
        _log_audit('create', 'customers', str(new_id), f'新增客户: ' + str(item.get('name') or item.get('co') or item.get('username') or item.get('bn') or item.get('ad') or item.get('xd') or '')[:60])
        return jsonify({'ok': True, 'id': new_id})
    elif request.method == 'PUT':
        item = request.get_json(force=True)
        now = datetime.datetime.now().isoformat()
        q('''
            INSERT INTO customers (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        '''.replace('?', '%s') if IS_PG else '''
            INSERT INTO customers (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        ''',
                   [item['id'], json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version('customers', item['id'])   # ★
        _log_audit('update', 'customers', str(item.get('id','')), '更新客户 #' + str(item.get('id',''))[:60])
        return jsonify({'ok': True})

    elif request.method == 'DELETE':
        id_ = request.get_json(force=True).get('id') if request.is_json else request.args.get('id')
        if id_:
            rows = q('SELECT data FROM customers WHERE id = ?', [int(id_)]).fetchall()
            if rows:
                item = json.loads(rows[0]['data']) if not IS_PG else json.loads(rows[0][0])
                _log_audit('delete', 'customers', id_, f'客户: {item.get("co","")} - {item.get("nn","")}')
            q('DELETE FROM customers WHERE id = ?', [int(id_)])
            db.commit()
            bump_version()  # ★
        return jsonify({'ok': True})
    return jsonify({'ok': True, 'deleted': False})

@app.route('/api/expenses', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_expenses():
    db = get_db()
    if request.method == 'GET':
        rows = q('SELECT data FROM expenses').fetchall()
        return jsonify(row_to_data(rows))

    elif request.method == 'POST':
        # 新增单条记录
        item = request.get_json(force=True)
        if not item:
            return jsonify({'error': 'no data'}), 400
        now = datetime.datetime.now().isoformat()
        cur = q('SELECT COALESCE(MAX(id), 0) FROM expenses')
        max_id = cur.fetchone()[0]
        new_id = (max_id or 0) + 1
        item['id'] = new_id
        q('INSERT INTO expenses (id, data, updated_at) VALUES (?, ?, ?)',
                   [new_id, json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version('expenses', new_id)
        _log_audit('create', 'expenses', str(new_id), f'新增费用: ' + str(item.get('name') or item.get('co') or item.get('username') or item.get('bn') or item.get('ad') or item.get('xd') or '')[:60])
        return jsonify({'ok': True, 'id': new_id})
    elif request.method == 'PUT':
        item = request.get_json(force=True)
        now = datetime.datetime.now().isoformat()
        q('''
            INSERT INTO expenses (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        '''.replace('?', '%s') if IS_PG else '''
            INSERT INTO expenses (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        ''',
                   [item['id'], json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version('expenses', item['id'])   # ★
        _log_audit('update', 'expenses', str(item.get('id','')), '更新费用 #' + str(item.get('id',''))[:60])
        return jsonify({'ok': True})

    elif request.method == 'DELETE':
        id_ = request.json.get('id') if request.is_json else request.args.get('id')
        if id_:
            rows = q('SELECT data FROM expenses WHERE id = ?', [int(id_)]).fetchall()
            if rows:
                item = json.loads(rows[0]['data']) if not IS_PG else json.loads(rows[0][0])
                _log_audit('delete', 'expenses', id_, f'费用: {item.get("bn","")} - {item.get("co","")}')
            q('DELETE FROM expenses WHERE id = ?', [int(id_)])
            db.commit()
            bump_version()  # ★
        return jsonify({'ok': True})
    return jsonify({'ok': True, 'deleted': False})

@app.route('/api/users', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_users():
    db = get_db()
    if request.method == 'GET':
        rows = q('SELECT data FROM users').fetchall()
        return jsonify([_strip_password(u) for u in row_to_data(rows)])

    elif request.method == 'POST':
        # 新增单条记录
        item = request.get_json(force=True)
        if not item:
            return jsonify({'error': 'no data'}), 400
        now = datetime.datetime.now().isoformat()
        cur = q('SELECT COALESCE(MAX(id), 0) FROM users')
        max_id = cur.fetchone()[0]
        new_id = (max_id or 0) + 1
        item['id'] = new_id
        q('INSERT INTO users (id, data, updated_at) VALUES (?, ?, ?)',
                   [new_id, json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version()
        _log_audit('create', 'users', str(new_id), f'新增用户: ' + str(item.get('name') or item.get('co') or item.get('username') or item.get('bn') or item.get('ad') or item.get('xd') or '')[:60])
        return jsonify({'ok': True, 'id': new_id})
    elif request.method == 'PUT':
        item = request.get_json(force=True)
        now = datetime.datetime.now().isoformat()
        q('''
            INSERT INTO users (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        '''.replace('?', '%s') if IS_PG else '''
            INSERT INTO users (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        ''',
                   [item.get('id', 0), json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version()   # ★
        _log_audit('update', 'users', str(item.get('id','')), '更新用户 #' + str(item.get('id',''))[:60])
        return jsonify({'ok': True})

    elif request.method == 'DELETE':
        id_ = request.get_json(force=True).get('id') if request.is_json else request.args.get('id')
        if id_:
            rows = q('SELECT data FROM users WHERE id = ?', [int(id_)]).fetchall()
            if rows:
                item = json.loads(rows[0]['data']) if not IS_PG else json.loads(rows[0][0])
                _log_audit('delete', 'users', id_, f'用户: {item.get("username","")} - {item.get("name","")}')
            q('DELETE FROM users WHERE id = ?', [int(id_)])
            db.commit()
            bump_version()  # ★
        return jsonify({'ok': True})
    return jsonify({'ok': True, 'deleted': False})

# ========== 批量同步接口 ==========
@app.route('/api/sync/addresses', methods=['POST'])
def api_sync_addresses():
    """批量同步：逐条 UPSERT，不再删全表重建"""
    data = request.get_json(force=True) or []
    db = get_db()
    now = datetime.datetime.now().isoformat()
    
    # 读取旧数据，检测变更
    old_rows = q('SELECT id, data FROM addresses').fetchall()
    old_map = {}
    for r in old_rows:
        if IS_PG:
            old_item = json.loads(r['data'])
        else:
            old_item = json.loads(r['data'])
        old_map[old_item.get('id')] = old_item
    
    new_ids = set()
    for item in data:
        item_id = item.get('id')
        if item_id is None:
            continue
        new_ids.add(item_id)
        if item_id not in old_map:
            summary = (item.get('ad','') + ' ' + item.get('rm','') + ' - ' + item.get('co','')) or ''
            _log_audit('create', 'addresses', str(item_id), f'添加地址: {summary}'[:120])
        else:
            old = old_map[item_id]
            changed = False
            for f in ['ad', 'rm', 'co', 'bn', 'sl', 'sd', 'ed', 'pm', 'cs']:
                if str(item.get(f,'')) != str(old.get(f,'')):
                    changed = True
                    break
            if changed:
                summary = (item.get('ad','') + ' ' + item.get('rm','') + ' - ' + item.get('co','')) or ''
                _log_audit('update', 'addresses', str(item_id), f'更新地址: {summary}'[:120])
    
    for old_id, old_item in old_map.items():
        if old_id not in new_ids:
            summary = (old_item.get('ad','') + ' ' + old_item.get('rm','') + ' - ' + old_item.get('co','')) or ''
            _log_audit('delete', 'addresses', str(old_id), f'删除地址: {summary}'[:120])
            q('DELETE FROM addresses WHERE id=?'.replace('?','%s') if IS_PG else 'DELETE FROM addresses WHERE id=?', [str(old_id)])
    
    # 逐条 UPSERT
    for i, item in enumerate(data):
        item_id = item.get('id', i+1)
        q('''
            INSERT INTO addresses (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        '''.replace('?', '%s') if IS_PG else '''
            INSERT INTO addresses (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        ''', [item_id, json.dumps(item, ensure_ascii=False), now])
    db.commit()
    bump_version()
    return jsonify({'ok': True, 'count': len(data)})

# ========== 批量同步接口 ==========
@app.route('/api/sync/orders', methods=['POST'])
def api_sync_orders():
    """批量同步：逐条 UPSERT，保留审批校验"""
    data = request.get_json(force=True) or []
    db = get_db()
    
    # 读取旧数据，检测变更
    old_rows = q('SELECT id, data FROM orders').fetchall()
    old_map = {}
    for r in old_rows:
        if IS_PG:
            old_item = json.loads(r['data'])
        else:
            old_item = json.loads(r['data'])
        old_map[old_item.get('id')] = old_item
    
    new_ids = set()
    for item in data:
        item_id = item.get('id')
        if item_id is None:
            continue
        new_ids.add(item_id)
        if item_id not in old_map:
            summary = (item.get('bn','') + ' - ' + item.get('co','') + (' (' + str(len(item.get('items',[]))) + '子订单)' if item.get('items') else '')) or ''
            _log_audit('create', 'orders', str(item_id), f'添加订单: {summary}'[:120])
        else:
            old = old_map[item_id]
            changed = False
            for f in ['bn', 'co', 'sl', 'sd', 'ed', 'pr', 'pm', 'cs', 'pg', 'ap', 'items']:
                if str(item.get(f,'')) != str(old.get(f,'')):
                    changed = True
                    break
            if changed:
                summary = (item.get('bn','') + ' - ' + item.get('co','') + (' (' + str(len(item.get('items',[]))) + '子订单)' if item.get('items') else '')) or ''
                _log_audit('update', 'orders', str(item_id), f'更新订单: {summary}'[:120])
    
    for old_id, old_item in old_map.items():
        if old_id not in new_ids:
            summary = (old_item.get('bn','') + ' - ' + old_item.get('co','') + (' (' + str(len(old_item.get('items',[]))) + '子订单)' if old_item.get('items') else '')) or ''
            _log_audit('delete', 'orders', str(old_id), f'删除订单: {summary}'[:120])
            # 从数据库删除该订单
            q('DELETE FROM orders WHERE id=?'.replace('?','%s') if IS_PG else 'DELETE FROM orders WHERE id=?', [str(old_id)])
    
    # 审批校验：已审批的子订单不可篡改
    for item in data:
        old = old_map.get(item.get('id'))
        if old:
            old_items = old.get('items') or []
            new_items = item.get('items') or []
            for oi in old_items:
                if oi.get('itemStatus') == 'approved':
                    for ni in new_items:
                        if ni.get('subBn') == oi.get('subBn'):
                            if ni.get('itemStatus') != 'approved':
                                ni['itemStatus'] = 'approved'
                                print(f'[审批] 拦截: {item.get("bn","")}/{oi.get("subBn","")} 状态被篡改，已恢复')
    
    # 逐条 UPSERT
    now = datetime.datetime.now().isoformat()
    for i, item in enumerate(data):
        item_id = item.get('id', i+1)
        # 自动计算利润
        pm = int(item.get('pm', 0) or 0)
        cs = int(item.get('cs', 0) or 0)
        item['profit'] = pm - cs
        if item.get('items'):
            for sub in item['items']:
                sub_pm = int(sub.get('pm', 0) or 0)
                sub_cs = int(sub.get('cost', 0) or 0)
                sub['profit'] = sub_pm - sub_cs
        q('''
            INSERT INTO orders (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        '''.replace('?', '%s') if IS_PG else '''
            INSERT INTO orders (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        ''', [item_id, json.dumps(item, ensure_ascii=False), now])
    db.commit()
    bump_version()
    return jsonify({'ok': True, 'count': len(data)})

# ========== 批量同步接口 ==========
@app.route('/api/sync/customers', methods=['POST'])
def api_sync_customers():
    """批量同步：逐条 UPSERT"""
    data = request.get_json(force=True) or []
    db = get_db()
    
    old_rows = q('SELECT id, data FROM customers').fetchall()
    old_map = {}
    for r in old_rows:
        if IS_PG:
            old_item = json.loads(r['data'])
        else:
            old_item = json.loads(r['data'])
        old_map[old_item.get('id')] = old_item
    
    new_ids = set()
    for item in data:
        item_id = item.get('id')
        if item_id is None:
            continue
        new_ids.add(item_id)
        if item_id not in old_map:
            summary = (item.get('co','') + ' (' + item.get('nn','') + ')') or ''
            _log_audit('create', 'customers', str(item_id), f'添加客户: {summary}'[:120])
        else:
            old = old_map[item_id]
            changed = False
            for f in ['co', 'nn', 'wx', 'ac', 'sl', 'ct']:
                if str(item.get(f,'')) != str(old.get(f,'')):
                    changed = True
                    break
            if changed:
                summary = (item.get('co','') + ' (' + item.get('nn','') + ')') or ''
                _log_audit('update', 'customers', str(item_id), f'更新客户: {summary}'[:120])
    
    for old_id, old_item in old_map.items():
        if old_id not in new_ids:
            summary = (old_item.get('co','') + ' (' + old_item.get('nn','') + ')') or ''
            _log_audit('delete', 'customers', str(old_id), f'删除客户: {summary}'[:120])
            q('DELETE FROM customers WHERE id=?'.replace('?','%s') if IS_PG else 'DELETE FROM customers WHERE id=?', [str(old_id)])
    
    now = datetime.datetime.now().isoformat()
    for i, item in enumerate(data):
        item_id = item.get('id', i+1)
        q('''
            INSERT INTO customers (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        '''.replace('?', '%s') if IS_PG else '''
            INSERT INTO customers (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        ''', [item_id, json.dumps(item, ensure_ascii=False), now])
    db.commit()
    bump_version()
    return jsonify({'ok': True, 'count': len(data)})

# ========== 批量同步接口 ==========
@app.route('/api/sync/expenses', methods=['POST'])
def api_sync_expenses():
    """批量同步：逐条 UPSERT"""
    data = request.get_json(force=True) or []
    db = get_db()
    
    old_rows = q('SELECT id, data FROM expenses').fetchall()
    old_map = {}
    for r in old_rows:
        if IS_PG:
            old_item = json.loads(r['data'])
        else:
            old_item = json.loads(r['data'])
        old_map[old_item.get('id')] = old_item
    
    new_ids = set()
    for item in data:
        item_id = item.get('id')
        if item_id is None:
            continue
        new_ids.add(item_id)
        if item_id not in old_map:
            summary = (item.get('bn','') + ' - ' + item.get('co','')) or ''
            _log_audit('create', 'expenses', str(item_id), f'添加费用: {summary}'[:120])
        else:
            old = old_map[item_id]
            changed = False
            for f in ['bn', 'co', 'sl', 'xa', 'xt']:
                if str(item.get(f,'')) != str(old.get(f,'')):
                    changed = True
                    break
            if changed:
                summary = (item.get('bn','') + ' - ' + item.get('co','')) or ''
                _log_audit('update', 'expenses', str(item_id), f'更新费用: {summary}'[:120])
    
    for old_id, old_item in old_map.items():
        if old_id not in new_ids:
            summary = (old_item.get('bn','') + ' - ' + old_item.get('co','')) or ''
            _log_audit('delete', 'expenses', str(old_id), f'删除费用: {summary}'[:120])
            q('DELETE FROM expenses WHERE id=?'.replace('?','%s') if IS_PG else 'DELETE FROM expenses WHERE id=?', [str(old_id)])
    
    now = datetime.datetime.now().isoformat()
    for i, item in enumerate(data):
        item_id = item.get('id', i+1)
        q('''
            INSERT INTO expenses (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        '''.replace('?', '%s') if IS_PG else '''
            INSERT INTO expenses (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        ''', [item_id, json.dumps(item, ensure_ascii=False), now])
    db.commit()
    bump_version()
    return jsonify({'ok': True, 'count': len(data)})

# ========== 批量同步接口 ==========
@app.route('/api/sync/users', methods=['POST'])
def api_sync_users():
    """批量同步：逐条 UPSERT"""
    data = request.get_json(force=True) or []
    db = get_db()
    
    old_rows = q('SELECT id, data FROM users').fetchall()
    old_map = {}
    for r in old_rows:
        if IS_PG:
            old_item = json.loads(r['data'])
        else:
            old_item = json.loads(r['data'])
        old_map[old_item.get('id')] = old_item
    
    new_ids = set()
    for item in data:
        item_id = item.get('id')
        if item_id is None:
            continue
        new_ids.add(item_id)
        if item_id not in old_map:
            summary = (item.get('username','') + ' (' + item.get('name','') + ')') or ''
            _log_audit('create', 'users', str(item_id), f'添加用户: {summary}'[:120])
        else:
            old = old_map[item_id]
            changed = False
            for f in ['username', 'name', 'role']:
                if str(item.get(f,'')) != str(old.get(f,'')):
                    changed = True
                    break
            if changed:
                summary = (item.get('username','') + ' (' + item.get('name','') + ')') or ''
                _log_audit('update', 'users', str(item_id), f'更新用户: {summary}'[:120])
    
    for old_id, old_item in old_map.items():
        if old_id not in new_ids:
            summary = (old_item.get('username','') + ' (' + old_item.get('name','') + ')') or ''
            _log_audit('delete', 'users', str(old_id), f'删除用户: {summary}'[:120])
            q('DELETE FROM users WHERE id=?'.replace('?','%s') if IS_PG else 'DELETE FROM users WHERE id=?', [str(old_id)])
    
    now = datetime.datetime.now().isoformat()
    for i, item in enumerate(data):
        item_id = item.get('id', i+1)
        q('''
            INSERT INTO users (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        '''.replace('?', '%s') if IS_PG else '''
            INSERT INTO users (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        ''', [item_id, json.dumps(item, ensure_ascii=False), now])
    db.commit()
    bump_version()
    return jsonify({'ok': True, 'count': len(data)})

# ========== 长轮询实时更新接口 ==========
import queue as Queue

@app.route('/api/audit-logs')
def api_audit_logs():
    """获取操作日志（最近100条）"""
    rows = q('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100').fetchall()
    if IS_PG:
        return jsonify([dict(r) for r in rows])
    return jsonify([dict(r) for r in rows])

@app.route('/api/events')
def api_events():
    """SSE (Server-Sent Events) 端点：替代长轮询"""
    def event_stream():
        last_ver = 0
        last_tv = {}
        while True:
            current_ver = get_data_version()
            if current_ver > last_ver:
                # 构建增量数据
                db = get_db()
                result = {'version': current_ver}
                changed = []
                for tbl in _TABLES:
                    sv = _table_versions.get(tbl, 0)
                    cv = last_tv.get(tbl, 0)
                    if sv > cv:
                        try:
                            result[tbl] = row_to_data(q(f'SELECT data FROM {tbl}').fetchall())
                            changed.append(tbl)
                        except:
                            pass
                result['_changed'] = changed
                last_ver = current_ver
                last_tv = dict(_table_versions)
                yield f'data: {json.dumps(result, ensure_ascii=False)}\n\n'
            else:
                # 没有新数据，等待半秒再检查
                time.sleep(0.5)
    
    return Response(
        event_stream(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        }
    )

@app.route('/api/updates')
def api_updates():
    """
    长轮询接口：支持增量模式
    - 客户端传入全局版本 v 或按表版本 v_base64
    - 返回增量数据（仅变化的表）
    - 兼容旧客户端（只传 v）
    """
    client_ver = int(request.args.get('v', '0'))
    # 按表版本（JSON对象，URL编码）
    table_vers_str = request.args.get('tv', '')
    client_table_vers = {}
    if table_vers_str:
        try:
            client_table_vers = json.loads(table_vers_str)
        except:
            pass
    
    current_ver = get_data_version()
    
    # 检查是否有新数据
    has_new = current_ver > client_ver
    if not has_new and table_vers_str:
        # 检查是否有任何表的版本高于客户端
        for tbl in _TABLES:
            sv = _table_versions.get(tbl, 0)
            cv = client_table_vers.get(tbl, 0)
            if sv > cv:
                has_new = True
                break
    
    if has_new:
        try:
            db = get_db()
            result = {'version': current_ver}
            changed = []
            # 只返回有变化的表
            for tbl in _TABLES:
                sv = _table_versions.get(tbl, 0)
                cv = client_table_vers.get(tbl, 0)
                if sv > cv or client_ver == 0:
                    result[tbl] = row_to_data(q(f'SELECT data FROM {tbl}').fetchall())
                    changed.append(tbl)
            result['_changed'] = changed
            return jsonify(result)
        except Exception as e:
            return jsonify({'ok': False, 'error': f'数据查询失败: {repr(e)}'}), 500

    # 版本没变 → 长轮询等待
    notif_q = Queue.Queue()
    with _subscribers_lock:
        _subscribers.append((notif_q, time.time()))
    try:
        new_ver = notif_q.get(timeout=30)
        if new_ver > client_ver:
            db = get_db()
            result = {'version': new_ver}
            changed = []
            for tbl in _TABLES:
                sv = _table_versions.get(tbl, 0)
                cv = client_table_vers.get(tbl, 0)
                if sv > cv:
                    result[tbl] = row_to_data(q(f'SELECT data FROM {tbl}').fetchall())
                    changed.append(tbl)
            result['_changed'] = changed
            return jsonify(result)
    except Queue.Empty:
        pass
    finally:
        with _subscribers_lock:
            for i, entry in enumerate(list(_subscribers)):
                if isinstance(entry, tuple) and entry[0] is notif_q:
                    _subscribers.pop(i)
                    break
            else:
                if notif_q in _subscribers:
                    _subscribers.remove(notif_q)
    
    return jsonify({'version': get_data_version()})


# ========== 登录认证 API ==========

@app.route('/api/login', methods=['POST'])
@rate_limit('login', max_requests=5, window_seconds=60)
def api_login():
    """登录：验证用户名密码，返回用户信息和 token"""
    data = request.get_json(force=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    role_filter = (data.get('role') or '').strip()

    db = get_db()
    rows = q('SELECT id, data FROM users').fetchall()
    users = row_to_data(rows)

    # 查找用户
    found = None
    for u in users:
        if u.get('username') == username:
            stored_pw = u.get('password', '')
            if check_password_hash(stored_pw, password):
                # 角色过滤
                if not role_filter or role_filter == u.get('role', ''):
                    found = u
                    break

    if not found:
        return jsonify({'ok': False, 'error': '账号或密码错误'}), 401

    # 生成 token（使用 itsdangerous 签名 token，支持服务重启和水平扩展）
    s = _get_token_serializer()
    token = s.dumps({
        'username': found['username'],
        'role': found['role'],
        'name': found['name'],
        'permissions': found.get('permissions', []),
    })
    # 同时保留一份到内存字典兼容旧客户端
    _tokens[token] = {
        'username': found['username'],
        'role': found['role'],
        'name': found['name'],
        'permissions': found.get('permissions', []),
        'expiry': time.time() + _TOKEN_EXPIRY
    }

    # 更新最后登录时间
    found['lastLogin'] = datetime.datetime.now().isoformat()
    # users 表使用 JSON-in-column 模式，username 在 data 字段内，通过 id 更新
    q('UPDATE users SET data=?, updated_at=? WHERE id=?',
      [json.dumps(found, ensure_ascii=False), datetime.datetime.now().isoformat(), found.get('id')])

    return jsonify({
        'ok': True,
        'token': token,
        'user': _strip_password(found)
    })


@app.route('/api/session', methods=['POST'])
def api_session():
    """验证 token，返回用户信息（用于自动登录恢复会话）"""
    data = request.get_json(force=True) or {}
    token = data.get('token', '')
    s = _verify_token(token)
    if not s:
        return jsonify({'ok': False, 'error': '登录已过期'}), 200

    # 从数据库获取最新用户信息（JSON-in-column 模式，用 json_extract 查询）
    db = get_db()
    rows = q("SELECT data FROM users WHERE json_extract(data, '$.username') = ?", [s['username']]).fetchall()
    if rows:
        user = row_to_data(rows)[0]
        return jsonify({'ok': True, 'user': _strip_password(user)})
    return jsonify({'ok': False, 'error': '用户不存在'}), 404


BASE_DIR = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ========== 合同生成配置（从 config.json 读取）==========
FONT_PATH = cfg.get('font_path')

@app.route('/')
def index():
    resp = send_from_directory(BASE_DIR, 'app.html')
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp

@app.route('/app.html')
def app_html():
    resp = send_from_directory(BASE_DIR, 'app.html')
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp

@app.route('/app.js')
def app_js():
    return send_from_directory(BASE_DIR, 'app.js')

@app.route('/style.css')
def style_css():
    return send_from_directory(BASE_DIR, 'style.css')

@app.route('/app.css')
def app_css():
    return send_from_directory(BASE_DIR, 'app.css')

@app.route('/data.js')
def data_js():
    return send_from_directory(BASE_DIR, 'data.js')

@app.route('/api/ping')
def api_ping():
    return jsonify({'ok': True, 'time': datetime.datetime.now().isoformat()})

@app.route('/api/server-info')
def api_server_info():
    return jsonify({
        'startTime': SERVER_START_TIME,
        'appFileMtime': os.path.getmtime(os.path.join(BASE_DIR, 'app.html'))
    })

@app.route('/api/version')
def api_version():
    """返回当前代码版本信息（Git 提交时间和 hash）"""
    try:
        git_dir = os.path.join(BASE_DIR, '.git')
        head_file = os.path.join(git_dir, 'HEAD')
        if os.path.isfile(head_file):
            with open(head_file, 'r') as f:
                ref = f.read().strip()
            if ref.startswith('ref: '):
                ref_path = os.path.join(git_dir, ref[5:])
                if os.path.isfile(ref_path):
                    with open(ref_path, 'r') as f:
                        commit_hash = f.read().strip()
                else:
                    commit_hash = ''
            else:
                commit_hash = ref
            # 读取提交时间
            commit_path = os.path.join(git_dir, 'objects', commit_hash[:2], commit_hash[2:])
            if os.path.isfile(commit_path):
                import zlib
                with open(commit_path, 'rb') as f:
                    raw = zlib.decompress(f.read()).decode('utf-8', errors='replace')
                for line in raw.split('\n'):
                    if line.startswith('committer '):
                        ts = int(line.split(' ')[-2])
                        dt = datetime.datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M')
                        return jsonify({'hash': commit_hash[:8], 'date': dt, 'ok': True})
        return jsonify({'hash': '', 'date': '', 'ok': False})
    except Exception as e:
        return jsonify({'hash': '', 'date': '', 'ok': False})

@app.route('/api/env')
def api_env():
    """返回当前运行环境：dev=测试版, production=正式版"""
    crm_db = os.environ.get('CRM_DB', '')
    env = 'dev' if crm_db else 'production'
    return jsonify({
        'env': env,
        'db': crm_db or 'crm_shared.db',
        'name': '测试版' if env == 'dev' else '正式版',
    })

# ========== 图片上传 API ==========
@app.route('/api/upload', methods=['POST'])
def api_upload():
    """上传图片文件，返回可访问的URL"""
    if 'file' not in request.files:
        return jsonify({'error': 'no file'}), 400
    f = request.files['file']
    if not f or not f.filename:
        return jsonify({'error': 'empty file'}), 400
    # 只允许图片
    allowed = {'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'}
    if f.content_type not in allowed:
        return jsonify({'error': 'only images allowed'}), 400
    # 生成唯一文件名
    ext = os.path.splitext(f.filename)[1] or '.png'
    fname = datetime.datetime.now().strftime('%Y%m%d_') + uuid.uuid4().hex[:8] + ext
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    fpath = os.path.join(UPLOAD_DIR, fname)
    f.save(fpath)
    url = '/uploads/' + fname
    return jsonify({'ok': True, 'url': url, 'filename': fname})

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    """提供上传图片的静态文件服务"""
    return send_from_directory(UPLOAD_DIR, filename)


# ========== 发票 API ==========

@app.route('/api/invoices', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_invoices():
    db = get_db()
    if request.method == 'GET':
        rows = q('SELECT data FROM invoices').fetchall()
        return jsonify(row_to_data(rows))

    elif request.method == 'POST':
        item = request.get_json(force=True)
        if not item:
            return jsonify({'error': 'no data'}), 400
        now = datetime.datetime.now().isoformat()
        cur = q('SELECT COALESCE(MAX(id), 0) FROM invoices')
        max_id = cur.fetchone()[0]
        new_id = (max_id or 0) + 1
        item['id'] = new_id
        q('INSERT INTO invoices (id, data, updated_at) VALUES (?, ?, ?)',
           [new_id, json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version('invoices', new_id)
        _log_audit('create', 'invoices', str(new_id), f'新增开票申请: {item.get("title","")} - ¥{item.get("amount","")}')
        return jsonify({'ok': True, 'id': new_id})

    elif request.method == 'PUT':
        item = request.json
        if not item:
            return jsonify({'error': 'no data'}), 400
        now = datetime.datetime.now().isoformat()
        q('''
            INSERT INTO invoices (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        '''.replace('?', '%s') if IS_PG else '''
            INSERT INTO invoices (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        ''',
           [item['id'], json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version('invoices', item['id'])
        _log_audit('update', 'invoices', str(item['id']), f'更新发票: {item.get("title","")}')
        return jsonify({'ok': True})

    elif request.method == 'DELETE':
        id_ = request.args.get('id', '')
        if id_:
            rows = q('SELECT data FROM invoices WHERE id = ?', [int(id_)]).fetchall()
            if rows:
                item = json.loads(rows[0]['data']) if not IS_PG else json.loads(rows[0][0])
                _log_audit('delete', 'invoices', id_, f'发票: {item.get("title","")}')
            q('DELETE FROM invoices WHERE id = ?', [int(id_)])
            db.commit()
            bump_version()
        return jsonify({'ok': True})
    return jsonify({'ok': True})

@app.route('/api/sync/invoices', methods=['POST'])
def api_sync_invoices():
    """批量同步发票"""
    data = request.get_json(force=True) or []
    db = get_db()
    now = datetime.datetime.now().isoformat()

    old_rows = q('SELECT id, data FROM invoices').fetchall()
    old_map = {}
    for r in old_rows:
        old_item = json.loads(r['data']) if not IS_PG else json.loads(r['data'])
        old_map[old_item.get('id')] = old_item

    new_ids = set()
    for item in data:
        item_id = item.get('id')
        if item_id:
            new_ids.add(item_id)
            old = old_map.get(item_id)
            if old != item:
                q('''
                    INSERT INTO invoices (id, data, updated_at) VALUES (?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
                '''.replace('?', '%s') if IS_PG else '''
                    INSERT INTO invoices (id, data, updated_at) VALUES (?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
                ''',
                   [item_id, json.dumps(item, ensure_ascii=False), now])

    # 删除客户端已不存在的记录
    deleted = 0
    for oid, oitem in old_map.items():
        if oid not in new_ids:
            q('DELETE FROM invoices WHERE id = ?', [oid])
            deleted += 1

    db.commit()
    bump_version()
    return jsonify({'ok': True, 'inserted': len(new_ids), 'deleted': deleted})


# ========== 通知 API ==========

@app.route('/api/notifications', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_notifications():
    db = get_db()
    if request.method == 'GET':
        rows = q('SELECT data FROM notifications').fetchall()
        return jsonify(row_to_data(rows))

    elif request.method == 'POST':
        item = request.get_json(force=True)
        if not item:
            return jsonify({'error': 'no data'}), 400
        now = datetime.datetime.now().isoformat()
        cur = q('SELECT COALESCE(MAX(id), 0) FROM notifications')
        max_id = cur.fetchone()[0]
        new_id = (max_id or 0) + 1
        item['id'] = new_id
        q('INSERT INTO notifications (id, data, updated_at) VALUES (?, ?, ?)',
           [new_id, json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version('notifications', new_id)
        return jsonify({'ok': True, 'id': new_id})

    elif request.method == 'PUT':
        item = request.json
        if not item:
            return jsonify({'error': 'no data'}), 400
        now = datetime.datetime.now().isoformat()
        q('''
            INSERT INTO notifications (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        '''.replace('?', '%s') if IS_PG else '''
            INSERT INTO notifications (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        ''',
           [item['id'], json.dumps(item, ensure_ascii=False), now])
        db.commit()
        bump_version('notifications', item['id'])
        return jsonify({'ok': True})

    elif request.method == 'DELETE':
        id_ = request.args.get('id', '')
        if id_:
            q('DELETE FROM notifications WHERE id = ?', [int(id_)])
            db.commit()
            bump_version('notifications', int(id_))
        return jsonify({'ok': True})
    return jsonify({'ok': True})

@app.route('/api/sync/notifications', methods=['POST'])
def api_sync_notifications():
    """批量同步通知"""
    data = request.get_json(force=True) or []
    db = get_db()
    now = datetime.datetime.now().isoformat()

    old_rows = q('SELECT id, data FROM notifications').fetchall()
    old_map = {}
    for r in old_rows:
        item = json.loads(r['data']) if not IS_PG else json.loads(r[0])
        old_map[r['id'] if not IS_PG else r[0]] = item

    new_ids = set()
    for item in data:
        item_id = item.get('id')
        if not item_id:
            continue
        new_ids.add(item_id)
        old = old_map.get(item_id)
        if old != item:
            q('''
                INSERT INTO notifications (id, data, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
            '''.replace('?', '%s') if IS_PG else '''
                INSERT INTO notifications (id, data, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
            ''',
               [item_id, json.dumps(item, ensure_ascii=False), now])

    # 删除客户端已不存在的记录
    deleted = 0
    for oid, oitem in old_map.items():
        if oid not in new_ids:
            q('DELETE FROM notifications WHERE id = ?', [oid])
            deleted += 1

    db.commit()
    bump_version()
    return jsonify({'ok': True, 'inserted': len(new_ids), 'deleted': deleted})


# ========== 合同生成 API ==========
# from docx import Document (removed contract)
# from docx.shared import Pt (removed contract)
# from docx.oxml.ns import qn (removed contract)
# from docx.oxml import OxmlElement (removed contract)
# from math import sqrt (removed contract)
# from PIL import Image, ImageDraw, ImageFont (removed contract)
# import glob (removed contract)


def set_run_font(run, font_name, font_size):
    run.font.name = font_name
    run.font.size = font_size
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.insert(0, rFonts)
    rFonts.set(qn('w:eastAsia'), font_name)


def set_all_fonts(doc, font_name, font_size):
    for para in doc.paragraphs:
        for run in para.runs:
            set_run_font(run, font_name, font_size)


def api_config_get():
    """获取当前配置"""
    return jsonify({'ok': True, 'config': cfg.get_all()})


@app.route('/api/config', methods=['POST'])
def api_config_save():
    """保存配置"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': '无数据'}), 400
        new_cfg = cfg.save_config(data)
        # 重新加载全局常量
        FONT_PATH = cfg.get('font_path')
        return jsonify({'ok': True, 'config': new_cfg})
    except Exception as e:
        return jsonify({'ok': False, 'error': "服务器内部错误，请查看日志"}), 500


        def process_one(idx, img_path, is_uploaded):
            """处理单张图片，idx 为序号（从1开始），is_uploaded标记是否来自上传"""
            try:
                img = Image.open(img_path).convert('RGBA')
                width, height = img.size
                shorter = min(width, height)

                # 以 1000px 为参考基准，等比缩放字体和间距（保证所有图片水印视觉一致）
                scale = shorter / 1000.0
                actual_fs = max(int(font_size * scale), 8)
                actual_sp_x = max(int(spacing_x * scale), 5)
                actual_sp_y = max(int(spacing_y * scale), 5)

                try:
                    font = ImageFont.truetype(FONT_PATH, actual_fs)
                except Exception:
                    font = ImageFont.load_default()

                # 计算当前图片的文字尺寸
                temp_tiny = Image.new('RGBA', (1, 1), (0, 0, 0, 0))
                bbox = ImageDraw.Draw(temp_tiny).textbbox((0, 0), watermark_text, font=font)
                text_w = bbox[2] - bbox[0]
                text_h = bbox[3] - bbox[1]

                # ① 建「对角线大小」的画布
                diag = int((width ** 2 + height ** 2) ** 0.5)
                big = Image.new('RGBA', (diag, diag), (0, 0, 0, 0))
                draw = ImageDraw.Draw(big)

                # ② 中心区域水平铺满水印（步长 = 文字尺寸 + 缩放后的间距）
                step_x = text_w + actual_sp_x
                step_y = text_h + actual_sp_y
                half = diag // 2
                for y in range(-half, half, step_y):
                    stagger = ((y // step_y) % 2) * (step_x // 2)
                    for x in range(-half, half, step_x):
                        draw.text((x + stagger + half, y + half),
                                  watermark_text, font=font,
                                  fill=(r, g, b, alpha_clamped))

                # ③ 整张画布一起旋转（expand=True，保留所有内容）
                big_rot = big.rotate(angle_val, expand=True, fillcolor=(0, 0, 0, 0))

                # 原图放在大画布中心作为背景
                bg_w, bg_h = big_rot.size
                canvas = Image.new('RGBA', (bg_w, bg_h), (0, 0, 0, 0))
                paste_x = (bg_w - width) // 2
                paste_y = (bg_h - height) // 2
                canvas.paste(img, (paste_x, paste_y))

                # 水印层覆盖原图（最上层）
                result = Image.alpha_composite(canvas, big_rot)

                # ④ 从合成结果中裁剪出原图尺寸
                result = result.crop((
                    paste_x, paste_y,
                    paste_x + width, paste_y + height
                )).convert('RGB')

                # 生成输出文件名
                ext = os.path.splitext(img_path)[1].lower()
                if use_date_prefix:
                    # 关联合同 → 26.6.9杭州xxx有限公司-1.jpg
                    base = f"{date_short}{company_name}"
                    if is_uploaded:
                        base += "合同"
                    out_name = f"{base}-{idx}{ext}"
                else:
                    # 独立打水印 → 仅供 XX 工商使用-1.jpg
                    base = safe_text
                    if is_uploaded:
                        base += "合同"
                    out_name = f"{base}-{idx}{ext}"
                out_path = os.path.join(output_dir, out_name)
                result.save(out_path, quality=92)
                big.close()
                big_rot.close()
                canvas.close()
                img.close()
                return (out_name, out_path, None)
            except Exception as e:
                return (os.path.basename(img_path), None, "服务器内部错误，请查看日志")

        # 并行处理所有图片
        with ThreadPoolExecutor(max_workers=min(6, len(image_files))) as executor:
            futures = {}
            up_idx = 0
            fld_idx = 0
            for i, p in enumerate(image_files):
                is_up = i < uploaded_count
                if is_up:
                    up_idx += 1
                    seq = up_idx
                else:
                    fld_idx += 1
                    seq = fld_idx
                f = executor.submit(process_one, seq, p, is_up)
                futures[f] = (p, is_up)
            for future in as_completed(futures):
                name, out_path, err = future.result()
                if err:
                    processed.append(f"{name} (失败: {err})")
                else:
                    processed.append(name)
                    src_path, is_up = futures[future]
                    if is_up:
                        uploaded_out_paths.append(out_path)
                    else:
                        folder_out_paths.append(out_path)

        # 生成PDF（默认生成，no_pdf='1'时跳过）
        pdf_path = None
        if folder_out_paths and not no_pdf:
            try:
                import img2pdf
                folder_out_paths.sort()
                # 收集所有图片的字节数据
                pdf_bytes = img2pdf.convert(folder_out_paths)
                pdf_name = f"{date_short}{company_name}-水印汇总.pdf" if use_date_prefix else f"{safe_text}-水印汇总.pdf"
                pdf_path = os.path.join(output_dir, pdf_name)
                with open(pdf_path, 'wb') as f:
                    f.write(pdf_bytes)
            except Exception as e:
                print(f"[水印] PDF生成失败: {e}")
                pdf_path = None

        result = {
            'ok': True,
            'folder': output_dir,
            'count': len(processed),
            'files': processed,
            'pdf_path': pdf_path
        }
        if pdf_path:
            pdf_name_only = os.path.basename(pdf_path)
            result['pdf_name'] = pdf_name_only

        return jsonify(result)

    except Exception as e:
        return jsonify({'ok': False, 'error': "服务器内部错误，请查看日志"}), 500
    finally:
        # 清理上传的临时文件
        try:
            temp_dir = os.path.join(tempfile.gettempdir(), '_crm_watermark_upload')
            if os.path.isdir(temp_dir):
                for f in os.listdir(temp_dir):
                    try: os.remove(os.path.join(temp_dir, f))
                    except: pass
                os.rmdir(temp_dir)
        except:
            pass

# ========== 启动初始化 ==========
with app.app_context():
    init_db()

# ========== 自动备份 ==========
BACKUP_DIR = os.path.join(os.path.dirname(__file__), 'backups')
os.makedirs(BACKUP_DIR, exist_ok=True)

def do_backup():
    """备份当前数据库到 backups/ 目录"""
    try:
        db_path = DB_PATH
        if not os.path.isfile(db_path):
            return
        ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        bak_name = f'crm_backup_{ts}.db'
        bak_path = os.path.join(BACKUP_DIR, bak_name)
        import shutil
        shutil.copy2(db_path, bak_path)
        # 只保留最近30个备份
        backups = sorted([f for f in os.listdir(BACKUP_DIR) if f.startswith('crm_backup_') and f.endswith('.db')])
        while len(backups) > 30:
            old = os.path.join(BACKUP_DIR, backups.pop(0))
            try: os.remove(old)
            except: pass
        return bak_path
    except Exception as e:
        print(f'[备份] 失败: {e}')
        return None

# 启动时备份一次
bak_path = do_backup()
if bak_path:
    print(f'[备份] 已创建: {os.path.basename(bak_path)}')

# 每天自动备份一次
def _backup_loop():
    while True:
        time.sleep(86400)  # 24小时
        do_backup()

_thread = threading.Thread(target=_backup_loop, daemon=True)
_thread.start()

# 速率限制缓存清理线程
def _rate_limit_cleanup():
    while True:
        time.sleep(300)  # 每5分钟清理过期记录
        now = time.time()
        with _RATE_LOCK:
            expired = [k for k, v in _RATE_LIMITS.items() if now - max(v) > 120]
            for k in expired:
                del _RATE_LIMITS[k]

_thread_rl = threading.Thread(target=_rate_limit_cleanup, daemon=True)
_thread_rl.start()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print(f"CRM服务启动，端口: {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
