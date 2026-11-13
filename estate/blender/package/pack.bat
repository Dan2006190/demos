@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "%~dp0tools\pack.ps1" goto nozip
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\pack.ps1"
if "%errorlevel%"=="0" exit /b 0
if "%errorlevel%"=="3" exit /b 1
goto fail

:nozip
echo.
echo   АРХИВ НЕ РАСПАКОВАН - так программа не запустится.
echo.
echo   1. Закройте это окно.
echo   2. Нажмите на arden-v2.zip правой кнопкой - "Извлечь все..." - укажите D:\ - "Извлечь".
echo   3. Откройте папку D:\arden и запустите pack.bat уже оттуда.
echo.
pause
exit /b 1

:fail
echo.
echo   Что-то пошло не так (код %errorlevel%).
echo   Сфотографируйте это окно и пришлите вместе с файлом log.txt из этой папки.
echo.
pause
exit /b 1
