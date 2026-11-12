@echo off
rem Запуск рендера Ардена. Аргумент: test | all | orbit | houses | approach | intro
chcp 65001 >nul
cd /d "%~dp0"
set "BL=%~dp0blender\blender.exe"
if not exist "%BL%" for /d %%D in ("%~dp0blender*") do if exist "%%D\blender.exe" set "BL=%%D\blender.exe"
if not exist "%BL%" (
  echo Не найден blender.exe. Распакуйте Blender в папку "blender" рядом с этим файлом.
  pause & exit /b 1
)
if not "%1"=="trees" if not exist "scene\village.glb" (
  echo Нет сцены: положите village.glb, village.json и sky_2k.hdr в папку "scene".
  pause & exit /b 1
)
"%BL%" -b -P arden_render.py -- --scene scene --out renders --what %1 %2 %3 %4
echo.
echo Готово. Результат — в папке renders.
pause
