# python_api/api.py

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from contextlib import asynccontextmanager
import asyncio
import os
import base64
import re
import cv2
import time # <-- Импортируем time для cache busting
from TikTokApi import TikTokApi
import uvicorn

# Импортируем наши модули
import config
import database
import services

# --- Создание папок ---
for folder in [config.VIDEO_CACHE_DIR, config.AUDIO_DIR, "templates/static", "templates/partials"]:
    if not os.path.exists(folder):
        os.makedirs(folder)
        
app_state = {}

# --- Надёжная функция для извлечения ID ---
def extract_video_id_from_url(url: str) -> str | None:
    match = re.search(r'\d{10,}', url)
    if match:
        return match.group(0)
    return None

# --- Контекст жизни приложения (запуск и остановка) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db_sync()
    config.logger.info("Запускаем TikTok API и создаем сессию...")
    api = TikTokApi()
    if config.MS_TOKEN:
        await api.create_sessions(ms_tokens=[config.MS_TOKEN], num_sessions=1, sleep_after=3, headless=True, browser="chromium")
    else:
        config.logger.error("MS_TOKEN не найден! API TikTok не будет работать.")
        
    app_state["api"] = api
    app_state["shazam"] = services.Shazam()
    app_state["lock"] = asyncio.Lock()
    config.logger.info(">>> Python API готов к приему запросов! <<<")
    yield
    config.logger.info("Закрываем сессию TikTok API...")
    if "api" in app_state and app_state["api"]:
        await app_state["api"].close_sessions()

app = FastAPI(lifespan=lifespan)

# --- Подключаем статику и шаблонизатор ---
app.mount("/static", StaticFiles(directory="templates/static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.get("/video_data")
async def get_video_data(original_url: str):
    config.logger.info(f"Получен запрос для URL: {original_url}")
    async with app_state["lock"]:
        resolved_url = await services.resolve_short_url(original_url)
        config.logger.info(f"URL распознан как: {resolved_url}")

        video_id = extract_video_id_from_url(resolved_url)
        
        if not video_id:
            config.logger.error(f"Не удалось извлечь Video ID из URL: {resolved_url}")
            raise HTTPException(status_code=400, detail="Неверный формат ссылки TikTok или не удалось распознать ID видео.")
        
        video_file_path, metadata = await database.get_cached_video(video_id)
        if video_file_path and metadata:
            return JSONResponse(content={"metadata": metadata, "videoFilePath": video_file_path})

        config.logger.info(f"Не найдено в кэше, загружаем: {video_id}")
        video_obj = app_state["api"].video(url=resolved_url)
        video_data = await video_obj.info(use_video_v2=True)
        
        no_watermark_url = video_data.get("video", {}).get("playAddr")
        if not no_watermark_url: raise HTTPException(status_code=404, detail="URL для скачивания не найден.")
        
        _, session = app_state["api"]._get_session()
        cookies = await app_state["api"].get_session_cookies(session)
        headers = {**session.headers, 'Referer': 'https://www.tiktok.com/'}
        async with services.httpx.AsyncClient() as client:
            r = await client.get(no_watermark_url, headers=headers, cookies=cookies, follow_redirects=True, timeout=60.0)
            r.raise_for_status()
            video_bytes = r.content

        video_file_path = os.path.abspath(os.path.join(config.VIDEO_CACHE_DIR, f"{video_id}.mp4"))
        with open(video_file_path, "wb") as f: f.write(video_bytes)
        
        video_details = services.get_video_details(video_file_path)
        shazam_result, audio_file_path = await services.recognize_and_download_shazam(video_bytes, app_state["shazam"])
        
        music_file_id = os.path.basename(audio_file_path).replace('.mp3', '') if audio_file_path else None

        metadata = {
            "video_id": video_id, "author": video_data.get('author', {}), "music": video_data.get('music', {}), 
            "description": video_data.get('desc'), "statistics": video_data.get('stats', {}), 
            "region": video_data.get('locationCreated'), "video_details": video_details, 
            "shazam": shazam_result, "authorStats": video_data.get('authorStats', {}), 
            "createTime": video_data.get('createTime'), "video_duration": video_data.get('video', {}).get('duration'), 
            "isDuet": bool(video_data.get('duetInfo')), "isStitch": bool(video_data.get('stitchInfo')), 
            "shadow_ban": bool(video_data.get("warnInfo") or video_data.get("privateItem", False)), "music_file_id": music_file_id
        }
        
        await database.save_video_to_cache(video_id, metadata, video_file_path, audio_file_path)
            
        video_base64 = base64.b64encode(video_bytes).decode('utf-8')
        return JSONResponse(content={"metadata": metadata, "videoBase64": video_base64})

@app.get("/video_file/{video_id}")
async def get_video_file(video_id: str):
    file_path = os.path.join(config.VIDEO_CACHE_DIR, f"{video_id}.mp4")
    if not os.path.exists(file_path): raise HTTPException(status_code=404, detail="Видеофайл не найден.")
    return FileResponse(path=file_path, media_type='video/mp4')

@app.get("/audio/{file_id}")
async def get_audio_file(file_id: str):
    file_path = os.path.join(config.AUDIO_DIR, f"{file_id}.mp3")
    if not os.path.exists(file_path): raise HTTPException(status_code=404, detail="Аудиофайл не найден.")
    return FileResponse(path=file_path, media_type='audio/mpeg', filename=f"track.mp3")

@app.get("/video_thumb/{video_id}")
async def get_video_thumbnail(video_id: str):
    video_path = os.path.join(config.VIDEO_CACHE_DIR, f"{video_id}.mp4")
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Видео не найдено.")
    cap = cv2.VideoCapture(video_path)
    success, image = cap.read()
    cap.release()
    if not success:
        raise HTTPException(status_code=500, detail="Не удалось извлечь кадр из видео.")
    success, buffer = cv2.imencode('.jpg', image)
    if not success:
        raise HTTPException(status_code=500, detail="Не удалось закодировать кадр в JPEG.")
    return Response(content=buffer.tobytes(), media_type='image/jpeg')


@app.get("/download/{video_id}/{music_file_id}", response_class=HTMLResponse)
async def download_page_with_video(request: Request, video_id: str, music_file_id: str):
    video_path = os.path.join(config.VIDEO_CACHE_DIR, f"{video_id}.mp4")
    music_path = os.path.join(config.AUDIO_DIR, f"{music_file_id}.mp3")
    
    if not os.path.exists(video_path) or not os.path.exists(music_path):
        return HTMLResponse(content="<h1>Ошибка 404: Файл не найден или устарел.</h1><p>Пожалуйста, отправьте ссылку на видео в бота заново.</p>", status_code=404)
    
    _, metadata = await database.get_cached_video(video_id)
    
    try:
        css_version = int(os.path.getmtime("templates/static/style.css"))
        js_version = int(os.path.getmtime("templates/static/script.js"))
    except OSError:
        css_version = js_version = int(time.time())
    
    context = {
        "request": request,
        "video_id": video_id,
        "music_file_id": music_file_id,
        "author_name": "Неизвестный автор",
        "video_desc": "Описание отсутствует.",
        "track_title": "Трек из видео",
        "track_artist": "Исполнитель неизвестен",
        "cover_url": f"/video_thumb/{video_id}",
        "author_avatar_url": "", # Пустое значение по умолчанию
        "css_version": css_version,
        "js_version": js_version
    }

    if metadata:
        context["author_name"] = metadata.get("author", {}).get("uniqueId", context["author_name"])
        context["video_desc"] = metadata.get("description") or context["video_desc"]
        context["author_avatar_url"] = metadata.get("author", {}).get("avatarThumb", "")
        if shazam_result := metadata.get("shazam"):
            context["track_title"] = shazam_result.get("title", context["track_title"])
            context["track_artist"] = shazam_result.get("artist", context["track_artist"])

    return templates.TemplateResponse("download_page.html", context)

if __name__ == "__main__":
    os.chdir(os.path.dirname(__file__))
    uvicorn.run("api:app", host="0.0.0.0", port=18361, reload=True)