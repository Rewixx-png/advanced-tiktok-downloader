import sqlite3
import aiosqlite
import json
import time
import os
from config import DB_FILE, logger

def init_db_sync():
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
        logger.error(f"КРИТИЧЕСКАЯ ОШИБКА при инициализации БД: {e}", exc_info=True)
        raise

async def get_cached_video(video_id: str):
    week_ago = int(time.time()) - 7 * 24 * 60 * 60
    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute(
            "SELECT video_file_path, metadata, audio_file_path FROM videos WHERE video_id = ? AND created_at >= ?",
            (video_id, week_ago)
        ) as cursor:
            cached = await cursor.fetchone()

    if cached and os.path.exists(cached[0]):
        try:
            # ИСПРАВЛЕНИЕ: Проверяем, что размер файла больше 1 КБ, чтобы отсечь поврежденные/пустые файлы
            if os.path.getsize(cached[0]) > 1024:
                logger.info(f"Найдено в кэше (валидный файл): {video_id}")
                video_file_path = cached[0]
                metadata = json.loads(cached[1])
                audio_file_path = cached[2]

                if audio_file_path and os.path.exists(audio_file_path):
                    metadata['music_file_id'] = os.path.basename(audio_file_path).replace('.mp3', '')
                else:
                    metadata['music_file_id'] = None
                    
                return video_file_path, metadata
            else:
                logger.warning(f"Найден поврежденный (слишком маленький) файл в кэше для {video_id}. Удаляем его.")
                os.remove(cached[0])
        except OSError as e:
            logger.error(f"Не удалось проверить кэшированный файл {cached[0]}: {e}")
            
    return None, None

async def save_video_to_cache(video_id, metadata, video_file_path, audio_file_path):
    async with aiosqlite.connect(DB_FILE) as db:
        await db.execute(
            "INSERT OR REPLACE INTO videos (video_id, metadata, video_file_path, audio_file_path, created_at) VALUES (?, ?, ?, ?, ?)",
            (video_id, json.dumps(metadata), video_file_path, audio_file_path, int(time.time()))
        )
        await db.commit()
    logger.info(f"Сохранено в кэш: {video_id}")