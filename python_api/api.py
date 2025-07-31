from TikTokApi import TikTokApi
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import asyncio
import os
import logging
import base64
import httpx
import tempfile
import cv2 # OpenCV для анализа видео
from shazamio import Shazam # ShazamIO для распознавания музыки
from playwright._impl._errors import TargetClosedError # <--- Импорт для отлова ошибки сессии

# --- Настройка ---
logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)
load_dotenv()
ms_token = os.environ.get("MS_TOKEN")
if not ms_token:
    raise ValueError("ms_token не найден в .env файле.")

# --- Глобальное хранилище для нашего API ---
app_state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- КОД ВЫПОЛНЯЕТСЯ ОДИН РАЗ ПРИ СТАРТЕ ---
    logger.info("Запускаем TikTok API и создаем сессию... Это может занять до минуты.")
    api = TikTokApi()
    # УБРАН НЕКОРРЕКТНЫЙ АРГУМЕНТ 'session_timeout'
    await api.create_sessions(ms_tokens=[ms_token], num_sessions=1, sleep_after=3, headless=True, browser="chromium")
    app_state["api"] = api
    app_state["shazam"] = Shazam()
    app_state["lock"] = asyncio.Lock()
    logger.info(">>> Python API готов к приему запросов! <<<")
    yield
    # --- КОД ВЫПОЛНЯЕТСЯ ПРИ ОСТАНОВКЕ ---
    logger.info("Закрываем сессию TikTok API...")
    if "api" in app_state and app_state["api"]:
         await app_state["api"].close_sessions()


app = FastAPI(lifespan=lifespan)

@app.get("/video_data")
async def get_video_data(url: str):
    logger.info(f"Получен запрос для URL: {url}")
    temp_video_path = None
    async with app_state["lock"]:
        # Даем две попытки: первая - с текущей сессией, вторая - с новой.
        for attempt in range(2):
            try:
                api = app_state["api"]
                
                video_obj = api.video(url=url)
                video_data = await video_obj.info()
                
                no_watermark_url = video_data.get("video", {}).get("playAddr")

                if not no_watermark_url:
                    raise HTTPException(status_code=404, detail="URL для скачивания без водяного знака не найден.")

                logger.info(f"Скачивание видео с URL: {no_watermark_url}")

                _, session = api._get_session()
                cookies = await api.get_session_cookies(session)
                headers = {**session.headers, 'Referer': 'https://www.tiktok.com/'}
                
                async with httpx.AsyncClient() as client:
                    response = await client.get(no_watermark_url, headers=headers, cookies=cookies, follow_redirects=True, timeout=60.0)
                    response.raise_for_status()
                    video_bytes = response.content
                
                logger.info("Видео успешно скачано.")
                
                with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_file:
                    temp_video_path = temp_file.name
                    temp_file.write(video_bytes)
                
                logger.info(f"Анализ видеофайла: {temp_video_path}")
                cap = cv2.VideoCapture(temp_video_path)
                fps = cap.get(cv2.CAP_PROP_FPS)
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                cap.release()

                video_size_mb = os.path.getsize(temp_video_path) / (1024 * 1024)
                video_details = {
                    "resolution": f"{width}x{height}",
                    "fps": round(fps),
                    "size_mb": f"{video_size_mb:.2f} MB"
                }
                logger.info(f"Детали видео: {video_details}")

                logger.info("Распознавание музыки через Shazam...")
                shazam_result = None
                try:
                    shazam = app_state["shazam"]
                    recognition_result = await shazam.recognize(temp_video_path)
                    if recognition_result.get('track'):
                        shazam_result = {
                            "artist": recognition_result['track'].get('subtitle', 'Неизвестен'),
                            "title": recognition_result['track'].get('title', 'Неизвестно')
                        }
                        logger.info(f"Shazam нашел трек: {shazam_result['title']} - {shazam_result['artist']}")
                    else:
                        logger.info("Shazam не смог распознать трек.")
                except Exception as e:
                    logger.error(f"Ошибка при распознавании Shazam: {e}")

                metadata = {
                    "author": video_data.get('author', {}),
                    "music": video_data.get('music', {}),
                    "description": video_data.get('desc'),
                    "statistics": video_data.get('statsV2', video_data.get('stats', {})),
                    "region": video_data.get('locationCreated'),
                    "video_details": video_details,
                    "shazam": shazam_result
                }

                video_base64 = base64.b64encode(video_bytes).decode('utf-8')
                final_response = { "metadata": metadata, "videoBase64": video_base64 }
                
                logger.info("Данные и видео успешно упакованы для отправки.")
                return JSONResponse(content=final_response)

            except TargetClosedError as e:
                logger.warning(f"Контекст браузера был закрыт (Попытка {attempt + 1}/2). Ошибка: {e}")
                if attempt == 0:
                    logger.info("Пересоздаем сессию TikTok API...")
                    await app_state["api"].close_sessions()
                    # УБРАН НЕКОРРЕКТНЫЙ АРГУМЕНТ 'session_timeout'
                    await app_state["api"].create_sessions(ms_tokens=[ms_token], num_sessions=1, sleep_after=3, headless=True, browser="chromium")
                    logger.info("Сессия пересоздана. Повторяем запрос...")
                    continue
                else:
                    logger.error("Не удалось выполнить запрос даже после перезапуска сессии.")
                    raise HTTPException(status_code=500, detail="Внутренняя ошибка: сессия с TikTok нестабильна.")
            
            except Exception as e:
                logger.error(f"Произошла критическая ошибка в Python API: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера при обработке видео.")
            
            finally:
                if temp_video_path and os.path.exists(temp_video_path):
                    os.unlink(temp_video_path)
                    logger.info(f"Временный файл {temp_video_path} удален.")
        
        raise HTTPException(status_code=500, detail="Произошла непредвиденная ошибка в логике обработки запроса.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=18361, workers=1)