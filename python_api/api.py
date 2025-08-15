import sqlite3
import json
import time
import aiosqlite
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
logger = logging.getLogger(__name__)
load_dotenv()
ms_token = os.environ.get("MS_TOKEN")
if not ms_token:
    raise ValueError("ms_token не найден в .env файле.")

DB_FILE = "cache.db"
VIDEO_CACHE_DIR = "video_cache"
AUDIO_DIR = "audio_files"
for folder in [VIDEO_CACHE_DIR, AUDIO_DIR]:
    if not os.path.exists(folder):
        os.makedirs(folder)
app_state = {}

def init_db_sync():
    """
    Надежная синхронная функция для создания/проверки базы данных перед запуском.
    """
    logger.info(f"Проверяем и инициализируем базу данных: {DB_FILE}")
    try:
        con = sqlite3.connect(DB_FILE)
        cur = con.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS videos (
                video_id TEXT PRIMARY KEY,
                metadata TEXT NOT NULL,
                video_file_path TEXT NOT NULL,
                audio_file_path TEXT,
                created_at INTEGER NOT NULL
            )
        """)
        con.commit()
        con.close()
        logger.info("База данных успешно инициализирована.")
    except Exception as e:
        logger.error(f"КРИТИЧЕСКАЯ ОШИБКА при инициализации БД: {e}")
        raise e

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db_sync()  # Вызываем надежную синхронную функцию при старте
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

async def download_music(search_query: str) -> str | None:
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
            music_file_id = str(uuid.uuid4())
            audio_path = os.path.abspath(os.path.join(AUDIO_DIR, f"{music_file_id}.mp3"))
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': audio_path.replace('.mp3', ''),
                'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}],
                'quiet': True
            }
            with YoutubeDL(ydl_opts) as ydl:
                ydl.download([target_url])
            if os.path.exists(audio_path):
                logger.info(f"Музыка сохранена в: {audio_path}")
                return audio_path
            else:
                logger.error(f"yt-dlp завершил, но файл {audio_path} не найден.")
                return None
    except Exception as e:
        logger.error(f"Ошибка скачивания музыки: {e}")
    return None

@app.get("/video_data")
async def get_video_data(original_url: str):
    async with app_state["lock"]:
        url = await resolve_short_url(original_url)
        video_id = url.split("/")[-1].split("?")[0]
        
        week_ago = int(time.time()) - 7 * 24 * 60 * 60
        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("SELECT metadata, video_file_path, audio_file_path FROM videos WHERE video_id = ? AND created_at >= ?", (video_id, week_ago)) as cursor:
                cached = await cursor.fetchone()
        
        if cached and os.path.exists(cached[1]):
            logger.info(f"Найдено в кэше: {video_id}")
            metadata = json.loads(cached[0])
            video_file_path = cached[1]
            audio_file_path = cached[2]
            
            if audio_file_path and os.path.exists(audio_file_path):
                metadata['music_file_id'] = os.path.basename(audio_file_path).replace('.mp3', '')
            
            return JSONResponse(content={"metadata": metadata, "videoFilePath": video_file_path})

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

        video_file_path = os.path.abspath(os.path.join(VIDEO_CACHE_DIR, f"{video_id}.mp4"))
        with open(video_file_path, "wb") as f: f.write(video_bytes)
        
        cap = cv2.VideoCapture(video_file_path)
        video_details = {"resolution": f"{int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}", "fps": round(cap.get(cv2.CAP_PROP_FPS)), "size_mb": f"{os.path.getsize(video_file_path) / (1024 * 1024):.2f} MB"}
        cap.release()

        shazam_result, audio_file_path, music_file_id = None, None, None
        try:
            with tempfile.NamedTemporaryFile(delete=True, suffix=".mp4") as temp_file:
                temp_file.write(video_bytes)
                recognition = await app_state["shazam"].recognize(temp_file.name)
                if recognition.get('track'):
                    shazam_result = {"artist": recognition['track'].get('subtitle', 'Неизвестен'), "title": recognition['track'].get('title', 'Неизвестно')}
                    if shazam_result["title"] != 'Неизвестно':
                        audio_file_path = await download_music(shazam_result['title'])
                        if audio_file_path:
                            music_file_id = os.path.basename(audio_file_path).replace('.mp3', '')
        except Exception as e:
            logger.error(f"Ошибка Shazam: {e}")

        metadata = {
            "video_id": video_id, "author": video_data.get('author', {}), "music": video_data.get('music', {}), 
            "description": video_data.get('desc'), "statistics": final_stats, 
            "region": video_data.get('locationCreated'), "video_details": video_details, 
            "shazam": shazam_result, "authorStats": video_data.get('authorStats', {}), 
            "createTime": video_data.get('createTime'), "video_duration": video_data.get('video', {}).get('duration'), 
            "hashtags": [f"#{c.get('title')}" for c in video_data.get('challenges', [])], 
            "isDuet": bool(video_data.get('duetInfo')), "isStitch": bool(video_data.get('stitchInfo')), 
            "shadow_ban": is_shadow_banned, "music_file_id": music_file_id
        }
        metadata_json_str = json.dumps(metadata)
        
        async with aiosqlite.connect(DB_FILE) as db:
            await db.execute("INSERT OR REPLACE INTO videos (video_id, metadata, video_file_path, audio_file_path, created_at) VALUES (?, ?, ?, ?, ?)", (video_id, metadata_json_str, video_file_path, audio_file_path, int(time.time())))
            await db.commit()
        logger.info(f"Сохранено в кэш: {video_id}")
            
        video_base64 = base64.b64encode(video_bytes).decode('utf-8')
        return JSONResponse(content={"metadata": metadata, "videoBase64": video_base64})

@app.get("/video_file/{video_id}")
async def get_video_file(video_id: str):
    file_path = os.path.join(VIDEO_CACHE_DIR, f"{video_id}.mp4")
    if not os.path.exists(file_path): raise HTTPException(status_code=404, detail="Видеофайл не найден.")
    return FileResponse(path=file_path, media_type='video/mp4')

@app.get("/download/{video_id}/{music_file_id}", response_class=HTMLResponse)
async def download_page_with_video(video_id: str, music_file_id: str):
    video_path = os.path.join(VIDEO_CACHE_DIR, f"{video_id}.mp4")
    music_path = os.path.join(AUDIO_DIR, f"{music_file_id}.mp3")
    if not os.path.exists(video_path) or not os.path.exists(music_path):
        return HTMLResponse(content="<h1>Ошибка 404: Файл не найден или устарел.</h1>", status_code=404)
    html_content = f"""<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Скачать трек</title><link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css" /><style>:root {{ --plyr-color-main: #1778f2; }}body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #000; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }}#bg-video {{ position: fixed; top: 50%; left: 50%; min-width: 100%; min-height: 100%; width: auto; height: auto; z-index: -1; transform: translateX(-50%) translateY(-50%); filter: blur(20px); opacity: 0.3; object-fit: cover; }}.container {{ z-index: 1; text-align: center; background-color: rgba(0, 0, 0, 0.5); padding: 40px; border-radius: 15px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); }}h1 {{ margin-top: 0; font-weight: 500; }}.player-container {{ margin-bottom: 25px; }}.download-btn {{ display: inline-block; text-decoration: none; background-color: var(--plyr-color-main); color: white; padding: 12px 24px; border-radius: 8px; font-size: 16px; font-weight: bold; transition: background-color 0.3s, transform 0.2s; }}.download-btn:hover {{ background-color: #1464c7; transform: scale(1.05); }}</style></head><body><video autoplay muted loop id="bg-video"><source src="/video_file/{video_id}" type="video/mp4"></video><div class="container"><h1>Прослушать и скачать трек</h1><div class="player-container"><audio id="player" controls><source src="/audio/{music_file_id}" type="audio/mp3" /></audio></div><a href="/audio/{music_file_id}" class="download-btn" download>Скачать MP3</a></div><script src="https://cdn.plyr.io/3.7.8/plyr.js"></script><script>const player = new Plyr('#player');</script></body></html>"""
    return HTMLResponse(content=html_content)

@app.get("/audio/{file_id}")
async def get_audio_file(file_id: str):
    file_path = os.path.join(AUDIO_DIR, f"{file_id}.mp3")
    if not os.path.exists(file_path): raise HTTPException(status_code=404, detail="Файл не найден.")
    return FileResponse(path=file_path, media_type='audio/mpeg', filename=f"track.mp3")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=18361)