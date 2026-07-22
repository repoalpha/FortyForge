@echo off
node "%~dp0node_modules\tsx\dist\cli.mjs" "%~dp0src\publisher\cli.ts" %*
