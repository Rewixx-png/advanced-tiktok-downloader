import sqlite3
import os
import time
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

DB_FILE = "cache.db"
VIDEO_CACHE_DIR = "video_cache"
AUDIO_DIR = "audio_files"
RETENTION_DAYS = 7 # Хранить файлы 7 дней

def cleanup():
    logging.info("--- Запуск очистки старого кэша ---")
    
    # 1. Очистка кэша видео и записей в БД
    try:
        con = sqlite3.connect(DB_FILE)
        cur = con.cursor()
        
        week_ago = int(time.time()) - RETENTION_DAYS * 24 * 60 * 60
        
        cur.execute("SELECT video_id, video_file_path FROM videos WHERE created_at < ?", (week_ago,))
        old_videos = cur.fetchall()
        
        if not old_videos:
            logging.info("Старых видео для удаления не найдено.")
        else:
            for video_id, file_path in old_videos:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logging.info(f"Удален видеофайл: {file_path}")
                else:
                    logging.warning(f"Файл не найден, но будет удален из БД: {file_path}")
            
            cur.execute("DELETE FROM videos WHERE created_at < ?", (week_ago,))
            con.commit()
            logging.info(f"Удалено {len(old_videos)} старых записей из базы данных.")
        
        con.close()
    except Exception as e:
        logging.error(f"Ошибка при очистке кэша видео: {e}")

    # 2. Очистка старых аудиофайлов
    try:
        for filename in os.listdir(AUDIO_DIR):
            file_path = os.path.join(AUDIO_DIR, filename)
            # Проверяем, что файлу больше суток
            if os.path.getmtime(file_path) < time.time() - (24 * 60 * 60):
                os.remove(file_path)
                logging.info(f"Удален старый аудиофайл: {file_path}")
    except Exception as e:
        logging.error(f"Ошибка при очистке аудиофайлов: {e}")
        
    logging.info("--- Очистка завершена ---")

if __name__ == "__main__":
    cleanup()