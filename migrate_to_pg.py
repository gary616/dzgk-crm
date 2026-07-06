"""
SQLite → PostgreSQL 数据迁移脚本

用法:
  1. 先备份 crm_shared.db
  2. python migrate_to_pg.py
  3. 生成 crm_pg_export.sql → 导入 PostgreSQL
"""
import sqlite3, json, os

DB_PATH = os.path.join(os.path.dirname(__file__), 'crm_shared.db')

TABLES = ['addresses', 'orders', 'customers', 'expenses', 'users', 'invoices', 'notifications', 'audit_log']

def export_schema_and_data():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    lines = []
    lines.append('-- SQLite → PostgreSQL 迁移导出')
    lines.append(f'-- 导出时间: {__import__("datetime").datetime.now().isoformat()}')
    lines.append('')
    lines.append('BEGIN;')
    lines.append('')

    for table in TABLES:
        # 获取表结构
        cols_raw = c.execute(f'PRAGMA table_info({table})').fetchall()
        col_names = [col['name'] for col in cols_raw]
        col_types = {}
        for col in cols_raw:
            col_types[col['name']] = col['type']

        # 生成 CREATE TABLE（如果表不存在）
        create_sql = f'CREATE TABLE IF NOT EXISTS {table} ('
        col_defs = []
        for col in cols_raw:
            pg_type = col['type']
            # SQLite → PostgreSQL 类型映射
            if 'INTEGER' in pg_type.upper():
                pg_type = 'BIGINT'
            elif 'TEXT' in pg_type.upper():
                pg_type = 'TEXT'
            elif 'REAL' in pg_type.upper():
                pg_type = 'DOUBLE PRECISION'
            pk = 'PRIMARY KEY' if col['pk'] else ''
            nn = 'NOT NULL' if col['notnull'] else ''
            default = f"DEFAULT {col['dflt_value']}" if col['dflt_value'] else ''
            col_defs.append(f'    {col["name"]} {pg_type} {nn} {pk} {default}'.strip())
        create_sql += ',\n'.join(col_defs)
        create_sql += '\n);'
        lines.append(create_sql)
        lines.append('')

        # 导出数据
        rows = c.execute(f'SELECT * FROM {table}').fetchall()
        if not rows:
            lines.append(f'-- {table}: 0 条数据')
            lines.append('')
            continue

        lines.append(f'-- {table}: {len(rows)} 条数据')
        for row in rows:
            row_dict = dict(row)
            # JSON 序列化 data 字段
            placeholders = []
            values = []
            for col in col_names:
                val = row_dict[col]
                if val is None:
                    placeholders.append('NULL')
                elif col_types.get(col, '').upper() in ('TEXT',):
                    # 对 TEXT 类型的值做 SQL 转义
                    escaped = str(val).replace("'", "''")
                    placeholders.append(f"'{escaped}'")
                elif col_types.get(col, '').upper() in ('INTEGER', 'BIGINT'):
                    placeholders.append(str(int(val)))
                elif col_types.get(col, '').upper() in ('REAL', 'DOUBLE PRECISION'):
                    placeholders.append(str(float(val)))
                else:
                    # 默认按字符串处理（data 字段）
                    escaped = str(val).replace("'", "''")
                    placeholders.append(f"'{escaped}'")

            insert_sql = f"INSERT INTO {table} ({', '.join(col_names)}) VALUES ({', '.join(placeholders)});"
            
            # 处理 ON CONFLICT
            if 'id' in col_names:
                insert_sql = f"INSERT INTO {table} ({', '.join(col_names)}) VALUES ({', '.join(placeholders)}) ON CONFLICT (id) DO UPDATE SET updated_at=EXCLUDED.updated_at;"

            lines.append(insert_sql)

        lines.append('')

    lines.append('COMMIT;')
    lines.append('')
    lines.append('-- 迁移完成')

    output = '\n'.join(lines)
    with open('crm_pg_export.sql', 'w', encoding='utf-8') as f:
        f.write(output)

    print(f'✅ 导出完成: crm_pg_export.sql ({len(output)/1024:.1f} KB)')
    print(f'   共 {len(TABLES)} 张表')
    for table in TABLES:
        cnt = c.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
        print(f'   {table}: {cnt} 条')

    conn.close()

if __name__ == '__main__':
    export_schema_and_data()
