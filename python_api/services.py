import httpx
import tempfile
import uuid
import os
import cv2
from yt_dlp import YoutubeDL
from shazamio import Shazam
from config import logger, YDL_OPTIONS, YOUTUBE_COOKIES, VIDEO_CACHE_DIR, AUDIO_DIR

async def resolve_short_url(url: str) -> str:
    if "vt.tiktok.com" in url or "vm.tiktok.com" in url:
        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                r = await client.head(url, timeout=15.0)
                return str(r.url).split("?")[0]
        except httpx.RequestError:
            logger.error("Не удалось обработать короткую ссылку TikTok.", exc_info=True)
            return url
    return url

async def download_music(search_query: str) -> str | None:
    cookie_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', encoding='utf-8')
    try:
        cookie_file.write(YOUTUBE_COOKIES.strip())
        cookie_file.close()

        music_file_id = str(uuid.uuid4())
        audio_path = os.path.abspath(os.path.join(AUDIO_DIR, f"{music_file_id}.mp3"))
        
        # --- ГЛАВНОЕ ИСПРАВЛЕНИЕ ЗДЕСЬ ---
        # Функция-фильтр для yt-dlp, которая проверяет длительность
        def duration_filter(info_dict):
            duration = info_dict.get('duration')
            if duration and duration > 300: # 300 секунд = 5 минут
                return 'Видео слишком длинное'
            return None

        ydl_opts = YDL_OPTIONS.copy()
        ydl_opts['cookiefile'] = cookie_file.name
        ydl_opts['outtmpl'] = audio_path.replace('.mp3', '')
        ydl_opts['match_filter'] = duration_filter # <-- ИСПОЛЬЗУЕМ ФУНКЦИЮ ВМЕСТО СТРОКИ
        search_string = f"ytsearch1:{search_query}"
        # --- КОНЕЦ ИСПРАВЛЕНИЯ ---

        logger.info(f"Ищем и скачиваем музыку с YouTube по запросу: '{search_string}'")
        with YoutubeDL(ydl_opts) as ydl:
            result = ydl.download([search_string])
            if result != 0:
                logger.warning(f"yt-dlp не смог скачать видео (возможно, не прошло фильтр).")
                return None

        if os.path.exists(audio_path):
            return audio_path
        return None
    except Exception as e:
        logger.error(f"Ошибка при скачивании музыки: {e}", exc_info=True)
        return None
    finally:
        if os.path.exists(cookie_file.name):
            os.remove(cookie_file.name)

def get_video_details(file_path: str) -> dict:
    cap = cv2.VideoCapture(file_path)
    details = {
        "resolution": f"{int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}",
        "fps": round(cap.get(cv2.CAP_PROP_FPS)),
        "size_mb": f"{os.path.getsize(file_path) / (1024 * 1024):.2f} MB"
    }
    cap.release()
    return details

async def recognize_and_download_shazam(video_bytes: bytes, shazam_instance: Shazam) -> tuple:
    try:
        with tempfile.NamedTemporaryFile(delete=True, suffix=".mp4") as temp_file:
            temp_file.write(video_bytes)
            recognition = await shazam_instance.recognize(temp_file.name)
            
        if track := recognition.get('track'):
            shazam_result = {
                "artist": track.get('subtitle', 'Неизвестен'),
                "title": track.get('title', 'Неизвестно')
            }
            if shazam_result["title"] != 'Неизвестно':
                search_query = f"{shazam_result.get('artist', '')} {shazam_result.get('title', '')}"
                audio_file_path = await download_music(search_query)
                return shazam_result, audio_file_path
    except Exception as e:
        logger.error(f"Ошибка Shazam: {e}")
    return None, None