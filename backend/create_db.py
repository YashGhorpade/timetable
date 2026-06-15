import os
import pyodbc

pwd = os.environ.get('MSSQL_SA_PASSWORD', 'GayatriFunde1709')
conn_str = (
    'DRIVER={ODBC Driver 18 for SQL Server};'
    'SERVER=mssql,1433;'
    f'UID=sa;PWD={pwd};'
    'TrustServerCertificate=yes;Encrypt=no;Connection Timeout=30'
)
print('Using connection string:', conn_str)
try:
    conn = pyodbc.connect(conn_str, autocommit=True)
    cur = conn.cursor()
    cur.execute("IF DB_ID('timetable_db') IS NULL CREATE DATABASE timetable_db;")
    print('Database ensured')
    cur.close()
    conn.close()
except Exception as e:
    print('ERROR', repr(e))
    raise
