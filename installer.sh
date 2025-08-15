#!/bin/bash

# =================================================================
#      Advanced TikTok Downloader - "Пуленепробиваемый" установщик v4.0
# =================================================================
# Скрипт гарантирует чистоту установки, удаляя старые процессы,
# и скрывает ненужный вывод, показывая ошибки при их возникновении.
# =================================================================

# --- Вспомогательные функции для вывода ---
print_info() { echo -e "\e[34mINFO:\e[0m $1"; }
print_success() { echo -e "\e[32mSUCCESS:\e[0m $1"; }
print_warning() { echo -e "\e[33mWARNING:\e[0m $1"; }
print_error() { echo -e "\e[31mERROR:\e[0m $1"; }

# --- Лог-файл и функция тихого выполнения ---
LOG_FILE="/tmp/tiktok_installer.log"
> "$LOG_FILE"

run_silent() {
    local message="$1"; shift;
    if ! "$@" >> "$LOG_FILE" 2>&1; then
        print_error "$message"
        echo "---------------------- ДЕТАЛЬНЫЙ ЛОГ ОШИБКИ ----------------------"
        cat "$LOG_FILE"
        echo "-----------------------------------------------------------------"
        exit 1
    fi
}

# --- 1. Проверка прав суперпользователя ---
if [ "$EUID" -ne 0 ]; then
    print_error "Пожалуйста, запустите этот скрипт с правами суперпользователя (sudo bash installer.sh)"
fi

clear
print_info "Добро пожаловать в 'пуленепробиваемый' установщик v4.0!"
echo "--------------------------------------------------"

# --- 2. Запрос данных ---
read -p "Введите ваш токен для Telegram-бота: " TELEGRAM_TOKEN
if [ -z "$TELEGRAM_TOKEN" ]; then print_error "Токен Telegram не может быть пустым."; fi
read -p "Введите ваш ms_token для TikTok: " MS_TOKEN
if [ -z "$MS_TOKEN" ]; then print_error "ms_token не может быть пустым."; fi
echo "--------------------------------------------------"

# --- 3. Установка зависимостей ---
print_info "Обновляем списки пакетов apt (тихий режим)..."
run_silent "Не удалось обновить списки пакетов." apt-get -y -qq update

print_info "Устанавливаем системные зависимости (git, python3, pip, curl, ffmpeg)..."
run_silent "Не удалось установить системные зависимости." apt-get -y -qq install git python3 python3-pip curl ffmpeg

# --- 4. Установка Node.js 20.x ---
print_info "Устанавливаем Node.js v20.x..."
NODE_SCRIPT_PATH="/tmp/nodesource_setup.sh"
run_silent "Не удалось скачать скрипт Node.js." curl -fsSL https://deb.nodesource.com/setup_20.x -o "$NODE_SCRIPT_PATH"
run_silent "Не удалось выполнить скрипт Node.js." bash "$NODE_SCRIPT_PATH"
run_silent "Не удалось установить Node.js." apt-get -y -qq install nodejs
rm "$NODE_SCRIPT_PATH"

# --- 5. Клонирование репозитория ---
ORIGINAL_USER="${SUDO_USER:-$(whoami)}"
PROJECT_DIR_FULL_PATH="/home/$ORIGINAL_USER/advanced-tiktok-downloader"
if [ ! -d "$PROJECT_DIR_FULL_PATH" ]; then
    print_info "Клонируем репозиторий в $PROJECT_DIR_FULL_PATH..."
    run_silent "Не удалось клонировать репозиторий." sudo -u "$ORIGINAL_USER" git clone https://github.com/Rewixx-png/advanced-tiktok-downloader.git "$PROJECT_DIR_FULL_PATH"
else
    print_warning "Директория проекта уже существует."
fi
cd "$PROJECT_DIR_FULL_PATH" || print_error "Не удалось перейти в директорию проекта."

# --- 6. Настройка Python API ---
print_info "Настраиваем Python API..."
cd python_api/ || print_error "Не найдена папка python_api."
mkdir -p audio_files video_cache
print_info "Устанавливаем Python-библиотеки (это может занять некоторое время)..."
run_silent "Не удалось обновить pip." python3 -m pip install --upgrade pip
run_silent "Не удалось установить Python-библиотеки." python3 -m pip install TikTokApi fastapi "uvicorn[standard]" python-dotenv playwright httpx shazamio opencv-python-headless yt-dlp youtube-search-python aiosqlite
print_info "Скачиваем браузер для Playwright (это может занять несколько минут)..."
run_silent "Не удалось установить браузер для Playwright." python3 -m playwright install chromium
print_info "Создаем файл конфигурации .env..."
echo "MS_TOKEN=$MS_TOKEN" > .env

# --- 7. Настройка Node.js Бота ---
print_info "Настраиваем Node.js бота..."
cd ../nodejs_bot/ || print_error "Не найдена папка nodejs_bot."
print_info "Устанавливаем Node.js зависимости..."
run_silent "Не удалось установить Node.js зависимости." npm install
print_info "Создаем файл с токеном Telegram..."
echo "$TELEGRAM_TOKEN" > token.txt

# --- 8. Настройка PM2 ---
print_info "Настраиваем менеджер процессов PM2..."
cd ..
run_silent "Не удалось установить PM2." npm install -g pm2

print_info "Очищаем PM2 от старых процессов..."
# Этот блок гарантирует, что не будет дубликатов
pm2 delete tiktok-api >> "$LOG_FILE" 2>&1 || true
pm2 delete tiktok-bot >> "$LOG_FILE" 2>&1 || true

print_info "Запускаем процессы через PM2 от имени пользователя '$ORIGINAL_USER'..."
run_silent "Не удалось запустить процессы." sudo -u "$ORIGINAL_USER" pm2 start python_api/api.py --name "tiktok-api" --interpreter python3
run_silent "Не удалось запустить процессы." sudo -u "$ORIGINAL_USER" pm2 start nodejs_bot/bot.js --name "tiktok-bot"

print_info "Сохраняем процессы для автозапуска после перезагрузки..."
run_silent "Не удалось сохранить процессы PM2." sudo -u "$ORIGINAL_USER" pm2 save
# Безопасная настройка автозапуска
STARTUP_CMD=$(pm2 startup systemd -u "$ORIGINAL_USER" --hp "/home/$ORIGINAL_USER" | tail -n 1)
if [[ $STARTUP_CMD == sudo* ]]; then
    run_silent "Не удалось настроить автозапуск PM2." eval "$STARTUP_CMD"
else
    print_warning "Не удалось автоматически настроить автозапуск PM2. Пожалуйста, выполните команду вручную."
fi

# --- 9. Настройка CRON-задачи ---
print_info "Добавляем CRON-задачу для автоматической очистки кэша..."
PYTHON_PATH=$(which python3)
CLEANUP_SCRIPT_PATH="$PROJECT_DIR_FULL_PATH/python_api/cleanup.py"
LOG_FILE_PATH="$PROJECT_DIR_FULL_PATH/cleanup.log"
CRON_CMD="$PYTHON_PATH $CLEANUP_SCRIPT_PATH >> $LOG_FILE_PATH 2>&1"
CRON_JOB="0 3 * * * $CRON_CMD"
run_silent "Не удалось настроить CRON-задачу." "(crontab -u \"$ORIGINAL_USER\" -l 2>/dev/null | grep -v -F \"$CLEANUP_SCRIPT_PATH\" ; echo \"$CRON_JOB\") | crontab -u \"$ORIGINAL_USER\" -"

# --- Финальное сообщение ---
rm -f "$LOG_FILE"
print_success "Установка успешно завершена!"
echo "=================================================="
echo "Бот и API запущены и добавлены в автозагрузку."
echo "Проверьте их статус командой: pm2 ls"
echo "=================================================="
