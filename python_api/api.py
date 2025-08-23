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
import time
import shutil
from TikTokApi import TikTokApi
import uvicorn

# Импортируем наши модули
import config
import database
import services

# --- Создание папок ---
for folder in [config.VIDEO_CACHE_DIR, config.AUDIO_DIR, config.TEMP_IMAGE_DIR, "templates/static", "templates/partials"]:
    if not os.path.exists(folder):
        os.makedirs(folder)
        
app_state = {}

# --- Функция для очистки временных папок с картинками ---
async def cleanup_folder(path: str, delay_seconds: int):
    await asyncio.sleep(delay_seconds)
    if os.path.exists(path):
        try:
            shutil.rmtree(path)
            config.logger.info(f"Временная папка удалена: {path}")
        except Exception as e:
            config.logger.error(f"Ошибка при удалении временной папки {path}: {e}")

# --- Улучшенная функция для извлечения ID ---
def extract_video_id_from_url(url: str) -> str | None:
    match = re.search(r'(?:video|photo)/(\d{19})', url)
    if match: return match.group(1)
    match = re.search(r'(\d{19,})', url)
    if match: return match.group(0)
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

# --- Подключаем статику ---
app.mount("/static", StaticFiles(directory="templates/static"), name="static")
app.mount("/temp_images", StaticFiles(directory=config.TEMP_IMAGE_DIR), name="temp_images")
templates = Jinja2Templates(directory="templates")

@app.get("/video_data")
async def get_video_data(original_url: str):
    config.logger.info(f"Получен запрос для URL: {original_url}")
    async with app_state["lock"]:
        api = app_state["api"]
        resolved_url = await services.resolve_short_url(original_url)
        video_id = extract_video_id_from_url(resolved_url)
        if not video_id:
            raise HTTPException(status_code=400, detail="Не удалось извлечь ID из ссылки.")
        
        # --- ГИБРИДНАЯ ЛОГИКА ---
        if 'photo' in resolved_url:
            # --- Логика для ФОТОАЛЬБОМОВ ---
            config.logger.info(f"Обнаружен фотоальбом (ID: {video_id}). Использую прямой метод API.")
            try:
                api_url = "https://www.tiktok.com/api/item/detail/"
                params = {"itemId": video_id}
                api_response = await api.make_request(url=api_url, params=params)
                post_data = api_response.get("itemInfo", {}).get("itemStruct")
                if not post_data: raise ValueError("Ключ 'itemStruct' не найден в ответе API TikTok.")
            except Exception as e:
                raise HTTPException(status_code=500, detail="Не удалось получить данные от TikTok.")

            image_urls = [img['imageURL']['urlList'][0] for img in post_data.get('imagePost', {}).get('images', [])]
            if not image_urls: raise HTTPException(status_code=404, detail="Не найдены URL изображений.")
            
            temp_image_dir_abs = os.path.join(config.TEMP_IMAGE_DIR, video_id)
            os.makedirs(temp_image_dir_abs, exist_ok=True)
            download_tasks, relative_image_urls = [], []
            for i, img_url in enumerate(image_urls):
                filename, full_path = f"image_{i+1}.jpeg", os.path.join(temp_image_dir_abs, f"image_{i+1}.jpeg")
                download_tasks.append(services.download_image_simple(img_url, full_path))
                relative_image_urls.append(f"/temp_images/{video_id}/{filename}")
            await asyncio.gather(*download_tasks)
            asyncio.create_task(cleanup_folder(temp_image_dir_abs, delay_seconds=600))
            return JSONResponse(content={"metadata": post_data, "image_paths": relative_image_urls})
        
        else:
            # --- Логика для ВИДЕО ---
            config.logger.info(f"Обнаружено видео (ID: {video_id}). Получаю информацию...")
            try:
                post_obj = api.video(url=resolved_url)
                post_data = await post_obj.info()
            except Exception as e:
                raise HTTPException(status_code=500, detail="Не удалось получить информацию о видео.")

            download_url = post_data.get("video", {}).get("playAddr")
            if not download_url:
                raise HTTPException(status_code=404, detail="URL для скачивания видео без водяного знака не найден.")
            
            config.logger.info("Скачиваю видеофайл без водяного знака...")
            video_bytes = await services.download_video_with_session(download_url, api)

            video_file_path = os.path.abspath(os.path.join(config.VIDEO_CACHE_DIR, f"{video_id}.mp4"))
            with open(video_file_path, "wb") as f: f.write(video_bytes)
            
            video_details = services.get_video_details(video_file_path)
            shazam_result, audio_file_path = await services.recognize_and_download_shazam(video_bytes, app_state["shazam"])
            
            post_data.update({
                "shazam": shazam_result,
                "videoDetails": video_details,
                "music_file_id": os.path.basename(audio_file_path).replace('.mp3', '') if audio_file_path else None
            })
            
            await database.save_video_to_cache(video_id, post_data, video_file_path, audio_file_path)
            
            video_base64 = base64.b64encode(video_bytes).decode('utf-8')
            return JSONResponse(content={"metadata": post_data, "videoBase64": video_base64})

# --- Остальные эндпоинты ---
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
    if not success: raise HTTPException(status_code=500, detail="Не удалось извлечь кадр из видео.")
    success, buffer = cv2.imencode('.jpg', image)
    if not success: raise HTTPException(status_code=500, detail="Не удалось закодировать кадр в JPEG.")
    return Response(content=buffer.tobytes(), media_type='image/jpeg')


@app.get("/download/{video_id}/{music_file_id}", response_class=HTMLResponse)
async def download_page_with_video(request: Request, video_id: str, music_file_id: str):
    video_path = os.path.join(config.VIDEO_CACHE_DIR, f"{video_id}.mp4")
    music_path = os.path.join(config.AUDIO_DIR, f"{music_file_id}.mp3")
    if not os.path.exists(video_path) or not os.path.exists(music_path):
        return HTMLResponse(content="<h1>Ошибка 404: Файл не найден или устарел.</h1>", status_code=404)
    
    _ , metadata = await database.get_cached_video(video_id)
    if not metadata:
        return HTMLResponse(content="<h1>Ошибка: Информация о видео не найдена.</h1>", status_code=404)

    try:
        css_version = int(os.path.getmtime("templates/static/style.css"))
        js_version = int(os.path.getmtime("templates/static/script.js"))
    except OSError:
        css_version = js_version = int(time.time())
    
    context = {
        "request": request, "video_id": video_id, "music_file_id": music_file_id,
        "author_name": metadata.get("author", {}).get("uniqueId", "Автор"),
        "video_desc": metadata.get("desc", ""),
        "author_avatar_url": metadata.get("author", {}).get("avatarThumb", ""),
        "track_title": metadata.get("shazam", {}).get("title", "Трек из видео"),
        "track_artist": metadata.get("shazam", {}).get("artist", "Исполнитель"),
        "cover_url": f"/video_thumb/{video_id}",
        "css_version": css_version, "js_version": js_version
    }
    return templates.TemplateResponse("download_page.html", context)

if __name__ == "__main__":
    os.chdir(os.path.dirname(__file__))
    uvicorn.run("api:app", host="0.0.0.0", port=18361, reload=True)