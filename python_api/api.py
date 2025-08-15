import aiosqlite
import json
import time
from TikTokApi import TikTokApi
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from contextlib import asynccontextmanager
import asyncio
import os
import logging
import base64
import httpx
import tempfile
import cv2
import uuid
from yt_dlp import YoutubeDL
from youtubesearchpython import VideosSearch
from shazamio import Shazam

# --- Настройка ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)
load_dotenv()
ms_token = os.environ.get("MS_TOKEN")
if not ms_token:
    raise ValueError("ms_token не найден в .env файле.")

# --- Настройки кэша ---
DB_FILE = "cache.db"
VIDEO_CACHE_DIR = "video_cache"
AUDIO_DIR = "audio_files"
for folder in [VIDEO_CACHE_DIR, AUDIO_DIR]:
    if not os.path.exists(folder):
        os.makedirs(folder)

app_state = {}
music_download_tasks = {}

async def init_db():
    async with aiosqlite.connect(DB_FILE) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS videos (
                video_id TEXT PRIMARY KEY,
                metadata TEXT NOT NULL,
                video_file_path TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)
        await db.commit()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Запускаем TikTok API и создаем сессию...")
    api = TikTokApi()
    await api.create_sessions(ms_tokens=[ms_token], num_sessions=1, sleep_after=3, headless=True, browser="chromium")
    app_state["api"] = api
    app_state["shazam"] = Shazam()
    app_state["lock"] = asyncio.Lock()
    logger.info(">>> Python API готов к приему запросов! <<<")
    yield
    logger.info("Закрываем сессию TikTok API...")
    if "api" in app_state and app_state["api"]:
        await app_state["api"].close_sessions()

app = FastAPI(lifespan=lifespan)

async def resolve_short_url(url: str):
    if "vt.tiktok.com" in url or "vm.tiktok.com" in url:
        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                r = await client.head(url, timeout=15.0)
                return str(r.url).split("?")[0]
        except httpx.RequestError:
            raise HTTPException(status_code=400, detail="Не удалось обработать короткую ссылку TikTok.")
    return url

def duration_to_seconds(duration_str):
    if not duration_str: return 0
    parts = duration_str.split(':')
    try:
        if len(parts) == 3: return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        if len(parts) == 2: return int(parts[0]) * 60 + int(parts[1])
        return int(parts[0])
    except ValueError: return 0

async def download_music_task(search_query: str, task_id: str):
    try:
        videos_search = VideosSearch(search_query, limit=5)
        results = videos_search.result()['result']
        target_url = None
        if results:
            for v in results:
                if 90 < duration_to_seconds(v.get('duration')) < 600:
                    target_url = v['link']
                    break
        if target_url:
            ydl_opts = {'format': 'bestaudio/best', 'outtmpl': os.path.join(AUDIO_DIR, f'{task_id}.%(ext)s'), 'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}], 'quiet': True}
            with YoutubeDL(ydl_opts) as ydl: ydl.download([target_url])
            music_download_tasks[task_id]['status'] = 'completed'
            music_download_tasks[task_id]['result'] = task_id
        else:
            music_download_tasks[task_id]['status'] = 'failed'
    except Exception as e:
        logger.error(f"[{task_id}] Ошибка скачивания музыки: {e}")
        music_download_tasks[task_id]['status'] = 'failed'

@app.get("/video_data")
async def get_video_data(original_url: str):
    async with app_state["lock"]:
        url = await resolve_short_url(original_url)
        video_id = url.split("/")[-1].split("?")[0]
        
        # --- ЭТАП 1: ПРОВЕРКА КЭША ---
        week_ago = int(time.time()) - 7 * 24 * 60 * 60
        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("SELECT metadata, video_file_path FROM videos WHERE video_id = ? AND created_at >= ?", (video_id, week_ago)) as cursor:
                cached = await cursor.fetchone()
        
        if cached:
            logger.info(f"Найдено в кэше: {video_id}")
            metadata_json_str, video_file_path = cached
            if os.path.exists(video_file_path):
                with open(video_file_path, "rb") as f: video_bytes = f.read()
                video_base64 = base64.b64encode(video_bytes).decode('utf-8')
                metadata = json.loads(metadata_json_str)
                
                music_task_id = None
                if metadata.get("shazam") and metadata["shazam"].get("title") != 'Неизвестно':
                    music_task_id = str(uuid.uuid4())
                    metadata["music_task_id"] = music_task_id
                    music_download_tasks[music_task_id] = {'status': 'pending'}
                    asyncio.create_task(download_music_task(metadata["shazam"]['title'], music_task_id))
                
                return JSONResponse(content={"metadata": metadata, "videoBase64": video_base64})

        # --- ЭТАП 2: ЕСЛИ В КЭШЕ НЕТ (Cache Miss) ---
        logger.info(f"Не найдено в кэше, загружаем: {video_id}")
        api = app_state["api"]
        video_obj = api.video(url=url)
        video_data = await video_obj.info(use_video_v2=True)
        
        final_stats = video_data.get('stats', video_data.get('statsV2', {}))
        is_shadow_banned = bool(video_data.get("warnInfo") or video_data.get("privateItem", False))
        no_watermark_url = video_data.get("video", {}).get("playAddr")
        if not no_watermark_url: raise HTTPException(status_code=404, detail="URL для скачивания не найден.")
        
        _, session = api._get_session()
        cookies = await api.get_session_cookies(session)
        headers = {**session.headers, 'Referer': 'https://www.tiktok.com/'}
        async with httpx.AsyncClient() as client:
            r = await client.get(no_watermark_url, headers=headers, cookies=cookies, follow_redirects=True, timeout=60.0)
            r.raise_for_status()
            video_bytes = r.content

        video_file_path = os.path.join(VIDEO_CACHE_DIR, f"{video_id}.mp4")
        with open(video_file_path, "wb") as f: f.write(video_bytes)
        
        cap = cv2.VideoCapture(video_file_path)
        video_details = {"resolution": f"{int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}", "fps": round(cap.get(cv2.CAP_PROP_FPS)), "size_mb": f"{os.path.getsize(video_file_path) / (1024 * 1024):.2f} MB"}
        cap.release()

        shazam_result, music_task_id = None, None
        try:
            with tempfile.NamedTemporaryFile(delete=True, suffix=".mp4") as temp_file:
                temp_file.write(video_bytes)
                recognition = await app_state["shazam"].recognize(temp_file.name)
                if recognition.get('track'):
                    shazam_result = {"artist": recognition['track'].get('subtitle', 'Неизвестен'), "title": recognition['track'].get('title', 'Неизвестно')}
                    if shazam_result["title"] != 'Неизвестно':
                        music_task_id = str(uuid.uuid4())
                        music_download_tasks[music_task_id] = {'status': 'pending'}
                        asyncio.create_task(download_music_task(shazam_result['title'], music_task_id))
        except Exception as e:
            logger.error(f"Ошибка Shazam: {e}")

        metadata = {
            "author": video_data.get('author', {}), "music": video_data.get('music', {}), 
            "description": video_data.get('desc'), "statistics": final_stats, 
            "region": video_data.get('locationCreated'), "video_details": video_details, 
            "shazam": shazam_result, "authorStats": video_data.get('authorStats', {}), 
            "createTime": video_data.get('createTime'), 
            "video_duration": video_data.get('video', {}).get('duration'), 
            "hashtags": [f"#{c.get('title')}" for c in video_data.get('challenges', [])], 
            "isDuet": bool(video_data.get('duetInfo')), "isStitch": bool(video_data.get('stitchInfo')), 
            "video_id": video_data.get('id'), "shadow_ban": is_shadow_banned, 
            "music_task_id": music_task_id
        }
        metadata_json_str = json.dumps(metadata)
        
        # --- ЭТАП 3: СОХРАНЕНИЕ В КЭШ ---
        async with aiosqlite.connect(DB_FILE) as db:
            await db.execute("INSERT OR REPLACE INTO videos (video_id, metadata, video_file_path, created_at) VALUES (?, ?, ?, ?)", (video_id, metadata_json_str, video_file_path, int(time.time())))
            await db.commit()
        logger.info(f"Сохранено в кэш: {video_id}")
            
        video_base64 = base64.b64encode(video_bytes).decode('utf-8')
        return JSONResponse(content={"metadata": metadata, "videoBase64": video_base64})

@app.get("/music_status/{task_id}")
async def music_status(task_id: str):
    task = music_download_tasks.get(task_id)
    if not task: raise HTTPException(status_code=404, detail="Задача не найдена.")
    for _ in range(120):
        if task['status'] != 'pending': break
        await asyncio.sleep(1)
    result = music_download_tasks.pop(task_id, None)
    if not result:
        return JSONResponse(content={"status": "failed", "result": None})
    return JSONResponse(content={"status": result.get('status'), "result": result.get('result')})

@app.get("/download/{file_id}", response_class=HTMLResponse)
async def download_page(file_id: str):
    file_path = os.path.join(AUDIO_DIR, f"{file_id}.mp3")
    if not os.path.exists(file_path):
        return HTMLResponse(content="<h1>Ошибка 404: Файл не найден или срок его хранения истек.</h1>", status_code=404)
    html_content = f"""<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Скачать музыку</title><style>body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f2f5; }}.container {{ text-align: center; }}h1 {{ color: #333; }}a {{ display: inline-block; text-decoration: none; background-color: #007bff; color: white; padding: 15px 30px; border-radius: 8px; font-size: 18px; font-weight: bold; transition: background-color 0.3s; }}a:hover {{ background-color: #0056b3; }}</style></head><body><div class="container"><h1>Ваш трек готов!</h1><a href="/audio/{file_id}" download>Скачать MP3</a></div></body></html>"""
    return HTMLResponse(content=html_content)

@app.get("/audio/{file_id}")
async def get_audio_file(file_id: str):
    file_path = os.path.join(AUDIO_DIR, f"{file_id}.mp3")
    if not os.path.exists(file_path): raise HTTPException(status_code=404, detail="Файл не найден.")
    return FileResponse(path=file_path, media_type='audio/mpeg', filename=f"track.mp3")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=18361)