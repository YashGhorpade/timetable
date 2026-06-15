-- Run once on first container start
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'timetable_db')
BEGIN
    CREATE DATABASE timetable_db
        COLLATE SQL_Latin1_General_CP1_CI_AS;
END
GO

USE timetable_db;
GO

-- Enable row-level change tracking for audit support
ALTER DATABASE timetable_db SET CHANGE_TRACKING = ON
    (CHANGE_RETENTION = 7 DAYS, AUTO_CLEANUP = ON);
GO
