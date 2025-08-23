# python_api/services.py

import httpx
import tempfile
import uuid
import os
import cv2
from yt_dlp import YoutubeDL
from shazamio import Shazam
from TikTokApi import TikTokApi # <-- Важный импорт для подсказок типов
from config import logger, YDL_OPTIONS, YOUTUBE_COOKIES, AUDIO_DIR

async def resolve_short_url(url: str) -> str:
    """Раскрывает короткие ссылки TikTok."""
    if "tiktok.com" in url:
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
                response = await client.head(url)
                final_url = str(response.url).split("?")[0]
                logger.info(f"Ссылка {url} раскрыта в {final_url}")
                return final_url
        except httpx.RequestError:
            return url.split("?")[0]
    return url.split("?")[0]

async def download_image_simple(url: str, path: str):
    """Надежно скачивает изображения для альбомов."""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            with open(path, "wb") as f:
                f.write(r.content)
    except Exception as e:
        logger.error(f"Ошибка при скачивании изображения {url}: {e}")

# ✅ ✅ ✅ ВОТ НЕДОСТАЮЩАЯ ФУНКЦИЯ ✅ ✅ ✅
async def download_video_with_session(url: str, api: TikTokApi) -> bytes:
    """Надежно скачивает видео по прямой ссылке, используя активную сессию TikTokApi."""
    try:
        _ , session = api._get_session()
        cookies = await api.get_session_cookies(session)
        headers = {**session.headers, 'Referer': 'https://www.tiktok.com/'}
        
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(url, headers=headers, cookies=cookies)
            r.raise_for_status()
            return r.content
    except Exception as e:
        logger.error(f"Ошибка при скачивании видеофайла по ссылке {url}: {e}", exc_info=True)
        raise

def get_video_details(file_path: str) -> dict:
    """Возвращает разрешение, FPS и размер видеофайла."""
    try:
        cap = cv2.VideoCapture(file_path)
        details = {
            "resolution": f"{int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}",
            "fps": round(cap.get(cv2.CAP_PROP_FPS)),
            "size_mb": f"{os.path.getsize(file_path) / (1024 * 1024):.2f} MB"
        }
        cap.release()
        return details
    except Exception as e:
        logger.error(f"Не удалось получить детали видео {file_path}: {e}")
        return {}


async def recognize_and_download_shazam(video_bytes: bytes, shazam_instance: Shazam) -> tuple:
    """Распознает музыку в видео и скачивает ее."""
    try:
        recognition = await shazam_instance.recognize(video_bytes)
        if track := recognition.get('track'):
            shazam_result = { "artist": track.get('subtitle', 'Неизвестен'), "title": track.get('title', 'Неизвестно') }
            if shazam_result["title"] != 'Неизвестно':
                search_query = f"{shazam_result.get('artist', '')} {shazam_result.get('title', '')}"
                audio_file_path = await download_music(search_query)
                return shazam_result, audio_file_path
    except Exception as e:
        logger.warning(f"Ошибка Shazam: {e}")
    return None, None

async def download_music(search_query: str) -> str | None:
    """Скачивает музыку с YouTube."""
    cookie_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', encoding='utf-8')
    try:
        cookie_file.write(YOUTUBE_COOKIES.strip())
        cookie_file.close()
        music_file_id = str(uuid.uuid4())
        audio_path = os.path.abspath(os.path.join(AUDIO_DIR, f"{music_file_id}.mp3"))
        ydl_opts = YDL_OPTIONS.copy()
        ydl_opts['cookiefile'] = cookie_file.name
        ydl_opts['outtmpl'] = audio_path.replace('.mp3', '')
        search_string = f"ytsearch1:{search_query}"
        with YoutubeDL(ydl_opts) as ydl:
            if ydl.download([search_string]) == 0 and os.path.exists(audio_path):
                return audio_path
        return None
    except Exception as e:
        logger.error(f"Ошибка при скачивании музыки: {e}", exc_info=True)
        return None
    finally:
        if os.path.exists(cookie_file.name):
            os.remove(cookie_file.name)