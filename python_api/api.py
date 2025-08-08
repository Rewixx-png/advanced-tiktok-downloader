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
import cv2
from shazamio import Shazam
from playwright._impl._errors import TargetClosedError

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
    logger.info("Запускаем TikTok API и создаем сессию...")
    api = TikTokApi() # Простое создание объекта, как было раньше
    await api.create_sessions(
        ms_tokens=[ms_token],
        num_sessions=1,
        sleep_after=3,
        headless=True,
        browser="chromium"
    )
    
    app_state["api"] = api
    app_state["shazam"] = Shazam()
    app_state["lock"] = asyncio.Lock()
    logger.info(">>> Python API готов к приему запросов! <<<")
    yield
    logger.info("Закрываем сессию TikTok API...")
    if "api" in app_state and app_state["api"]:
         await app_state["api"].close_sessions()

app = FastAPI(lifespan=lifespan)

async def resolve_short_url(url: str) -> str:
    if "vt.tiktok.com" in url or "vm.tiktok.com" in url:
        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                response = await client.head(url, timeout=15.0)
                return str(response.url).split("?")[0]
        except httpx.RequestError:
            raise HTTPException(status_code=400, detail="Не удалось обработать короткую ссылку TikTok.")
    return url

@app.get("/video_data")
async def get_video_data(original_url: str):
    logger.info(f"Получен запрос для URL: {original_url}")
    temp_video_path = None
    
    try:
        url = await resolve_short_url(original_url)
    except HTTPException as e:
        raise e

    async with app_state["lock"]:
        for attempt in range(2):
            try:
                api = app_state["api"]
                video_obj = api.video(url=url)
                video_data = await video_obj.info(use_video_v2=True)
                
                no_watermark_url = video_data.get("video", {}).get("playAddr")
                if not no_watermark_url:
                    raise HTTPException(status_code=404, detail="URL для скачивания не найден.")

                _, session = api._get_session()
                cookies = await api.get_session_cookies(session)
                headers = {**session.headers, 'Referer': 'https://www.tiktok.com/'}
                
                async with httpx.AsyncClient() as client:
                    response = await client.get(no_watermark_url, headers=headers, cookies=cookies, follow_redirects=True, timeout=60.0)
                    response.raise_for_status()
                    video_bytes = response.content
                
                with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_file:
                    temp_video_path = temp_file.name
                    temp_file.write(video_bytes)
                
                cap = cv2.VideoCapture(temp_video_path)
                video_details = {"resolution": f"{int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}", "fps": round(cap.get(cv2.CAP_PROP_FPS)), "size_mb": f"{os.path.getsize(temp_video_path) / (1024 * 1024):.2f} MB"}
                cap.release()

                shazam_result = None
                try:
                    recognition_result = await app_state["shazam"].recognize(temp_video_path)
                    if recognition_result.get('track'):
                        shazam_result = {"artist": recognition_result['track'].get('subtitle', 'Неизвестен'), "title": recognition_result['track'].get('title', 'Неизвестно')}
                except Exception as e:
                    logger.error(f"Ошибка Shazam: {e}")

                challenges = video_data.get('challenges', [])
                hashtags = [f"#{challenge.get('title')}" for challenge in challenges if challenge.get('title')]
                metadata = {"author": video_data.get('author', {}), "music": video_data.get('music', {}), "description": video_data.get('desc'), "statistics": video_data.get('statsV2', video_data.get('stats', {})), "region": video_data.get('locationCreated'), "video_details": video_details, "shazam": shazam_result, "authorStats": video_data.get('authorStats', {}), "createTime": video_data.get('createTime'), "video_duration": video_data.get('video', {}).get('duration'), "hashtags": hashtags, "isDuet": bool(video_data.get('duetInfo')), "isStitch": bool(video_data.get('stitchInfo')), "video_id": video_data.get('id')}

                video_base64 = base64.b64encode(video_bytes).decode('utf-8')
                return JSONResponse(content={"metadata": metadata, "videoBase64": video_base64})

            except TargetClosedError as e:
                logger.warning(f"Контекст браузера закрыт (Попытка {attempt + 1}/2): {e}")
                if attempt == 0:
                    await app_state["api"].close_sessions()
                    new_api = TikTokApi()
                    await new_api.create_sessions(ms_tokens=[ms_token], num_sessions=1, sleep_after=3, headless=True)
                    app_state["api"] = new_api
                    continue
                raise HTTPException(status_code=500, detail="Сессия с TikTok нестабильна.")
            
            except Exception as e:
                logger.error(f"Критическая ошибка в /video_data: {e}", exc_info=True)
                if "URL format not supported" in str(e):
                    raise HTTPException(status_code=400, detail="Неверный формат ссылки TikTok.")
                raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера.")
            
            finally:
                if temp_video_path and os.path.exists(temp_video_path):
                    os.unlink(temp_video_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=18361)