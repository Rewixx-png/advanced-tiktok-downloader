from TikTokApi import TikTokApi
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import asyncio
import os
import logging
import base64

# --- Настройка ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
load_dotenv()
ms_token = os.environ.get("MS_TOKEN")
if not ms_token:
    raise ValueError("ms_token не найден в .env файле.")

# --- Глобальное хранилище для нашего API и блокировки ---
app_state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- КОД ВЫПОЛНЯЕТСЯ ОДИН РАЗ ПРИ СТАРТЕ ---
    logger.info("Запускаем TikTok API и создаем сессию... Это может занять до минуты.")
    api = TikTokApi()
    await api.create_sessions(ms_tokens=[ms_token], num_sessions=1, sleep_after=3, headless=True)
    app_state["api"] = api
    app_state["lock"] = asyncio.Lock()
    logger.info(">>> Python API готов к приему запросов! <<<")
    yield
    # --- КОД ВЫПОЛНЯЕТСЯ ПРИ ОСТАНОВКЕ ---
    logger.info("Закрываем сессию TikTok API...")
    await app_state["api"].close()

app = FastAPI(lifespan=lifespan)

@app.get("/video_data")
async def get_video_data(url: str):
    logger.info(f"Получен запрос для URL: {url}")
    async with app_state["lock"]:
        try:
            api = app_state["api"]
            
            video_obj = api.video(url=url)
            video_data = await video_obj.info()
            
            # --- ГЛАВНОЕ ИЗМЕНЕНИЕ: СКАЧИВАЕМ ВИДЕО ПРЯМО ЧЕРЕЗ БИБЛИОТЕКУ ---
            logger.info("Скачивание видео через сессию браузера...")
            video_bytes = await video_obj.bytes()
            logger.info("Видео успешно скачано.")
            # ----------------------------------------------------------------
            
            author_info = video_data.get('author', {})
            music_info = video_data.get('music', {})
            stats_info = video_data.get('stats', {})

            metadata = {
                "author": { "nickname": author_info.get('nickname'), "unique_id": author_info.get('uniqueId') },
                "music": { "title": music_info.get('title'), "author": music_info.get('authorName') },
                "description": video_data.get('desc'),
                "statistics": stats_info
            }

            video_base64 = base64.b64encode(video_bytes).decode('utf-8')
            final_response = { "metadata": metadata, "video_base64": video_base64 }
            
            logger.info("Данные и видео успешно упакованы для отправки.")
            return JSONResponse(content=final_response)
            
        except Exception as e:
            logger.error(f"Произошла критическая ошибка в Python API: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=18361)