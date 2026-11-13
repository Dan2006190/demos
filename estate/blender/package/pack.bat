@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Собирает готовые кадры (без черновиков _work) и log.txt в arden_renders.zip — встроенный в Windows tar
if not exist "renders" goto norender
if exist "arden_renders.zip" del "arden_renders.zip"
set "LOG="
if exist "log.txt" set "LOG=log.txt"
tar -a -c -f "arden_renders.zip" --exclude "renders/_work" renders %LOG%
if errorlevel 1 goto fail
echo.
echo   Готово: arden_renders.zip - пришлите этот файл.
echo.
explorer /select,"%~dp0arden_renders.zip"
pause
exit /b 0
:norender
echo.
echo   Папки renders ещё нет - рендер не запускался. Сначала START.bat.
echo.
pause
exit /b 1
:fail
echo.
echo   Не получилось упаковать. Можно просто заархивировать папку renders вручную
echo   (правой кнопкой - "Отправить" - "Сжатая ZIP-папка"), папку renders\_work не включать.
echo.
pause
exit /b 1
