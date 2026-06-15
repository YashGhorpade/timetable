import os
import pyodbc
pwd = os.environ.get('MSSQL_SA_PASSWORD', 'GayatriFunde1709')
conn_str = (
    'DRIVER={ODBC Driver 18 for SQL Server};'
    'SERVER=mssql,1433;'
    f'UID=sa;PWD={pwd};'
    'DATABASE=timetable_db;TrustServerCertificate=yes;Encrypt=no;Connection Timeout=30'
)
print('Connecting with', conn_str)
try:
    conn = pyodbc.connect(conn_str)
    cur = conn.cursor()
    cur.execute("SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'")
    rows = cur.fetchall()
    for r in rows:
        print(r[0], r[1])
    cur.close()
    conn.close()
except Exception as e:
    print('ERROR', repr(e))
    raise
