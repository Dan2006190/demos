@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Арден — рендер
rem Рендер Ардена: как в клубе — просто Blender и скрипт, без PowerShell.
rem Готовые кадры не пересчитываются: можно закрыть окно и запустить снова.

if not exist "%~dp0arden_render.py" goto nozip

rem --- где Blender: рядом в папке blender, или установленный 4.5 / 4.4 / 4.3 / 4.2, или Steam
set "BL="
if exist "%~dp0blender\blender.exe" set "BL=%~dp0blender\blender.exe"
if not defined BL for /d %%D in ("%~dp0blender*") do if exist "%%D\blender.exe" set "BL=%%D\blender.exe"
for %%V in (4.5 4.4 4.3 4.2) do if not defined BL if exist "%ProgramFiles%\Blender Foundation\Blender %%V\blender.exe" set "BL=%ProgramFiles%\Blender Foundation\Blender %%V\blender.exe"
if not defined BL if exist "%ProgramFiles(x86)%\Steam\steamapps\common\Blender\blender.exe" set "BL=%ProgramFiles(x86)%\Steam\steamapps\common\Blender\blender.exe"
if not defined BL goto noblender

echo.
echo   Blender: %BL%
echo   Режим: 3 часа. Ход работы - в файле renders\status.txt. Окно не закрывать.
echo.
set /a RUN=0
:again
set /a RUN+=1
"%BL%" -b --factory-startup --python-exit-code 1 -P "%~dp0arden_render.py" -- --scene "%~dp0scene" --out "%~dp0renders" --what all --mode 3h
if not errorlevel 1 goto done
if %RUN% geq 8 goto failed
echo.
echo   Blender остановился с ошибкой. Перезапуск %RUN%/8 через 30 секунд - готовые кадры сохранены.
timeout /t 30 /nobreak >nul
goto again

:done
echo.
echo   ГОТОВО. Запустите pack.bat и пришлите получившийся файл arden_renders.zip.
echo.
pause
exit /b 0

:failed
echo.
echo   Рендер 8 раз остановился с ошибкой. Сфотографируйте это окно и пришлите вместе с файлом log.txt.
echo.
pause
exit /b 1

:noblender
echo.
echo   НЕ НАЙДЕН BLENDER.
echo   Сейчас откроется страница blender.org: скачайте Blender 4.5 LTS (Windows Installer),
echo   установите как обычную программу (Далее - Далее - Готово) и снова запустите START_3h.bat.
echo.
start "" "https://www.blender.org/download/lts/4-5/"
pause
exit /b 1

:nozip
echo.
echo   АРХИВ НЕ РАСПАКОВАН - так программа не запустится.
echo   Нажмите на arden-v2.zip правой кнопкой - "Извлечь все..." - "Извлечь",
echo   откройте папку arden и запустите START_3h.bat оттуда.
echo.
pause
exit /b 1
