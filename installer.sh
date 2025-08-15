#!/bin/bash

# =================================================================
#      Advanced TikTok Downloader - Установщик v5.0 ("Стабильность")
# =================================================================
# Исправлены все известные проблемы с PM2, CRON и автозапуском.
# Гарантирует чистоту установки и тихую работу.
# =================================================================

clear # Очищаем терминал перед началом

# --- Вспомогательные функции и лог ---
print_info() { echo -e "\e[34mINFO:\e[0m $1"; }
print_success() { echo -e "\e[32mSUCCESS:\e[0m $1"; }
print_warning() { echo -e "\e[33mWARNING:\e[0m $1"; }
print_error() { echo -e "\e[31mERROR:\e[0m $1"; }
LOG_FILE="/tmp/tiktok_installer.log"; > "$LOG_FILE"
run_silent() {
    local msg="$1"; shift;
    if ! "$@" >> "$LOG_FILE" 2>&1; then
        print_error "$msg"
        echo "---------------------- ДЕТАЛЬНЫЙ ЛОГ ОШИБКИ ----------------------"
        cat "$LOG_FILE"; echo "-----------------------------------------------------------------"
        exit 1
    fi
}

# --- 1. Проверка и запрос данных ---
if [ "$EUID" -ne 0 ]; then print_error "Пожалуйста, запустите скрипт с правами sudo."; fi
print_info "Добро пожаловать в установщик v5.0 ('Стабильность')!"
echo "--------------------------------------------------"
read -p "Введите ваш токен для Telegram-бота: " TELEGRAM_TOKEN
if [ -z "$TELEGRAM_TOKEN" ]; then print_error "Токен Telegram не может быть пустым."; fi
read -p "Введите ваш ms_token для TikTok: " MS_TOKEN
if [ -z "$MS_TOKEN" ]; then print_error "ms_token не может быть пустым."; fi
echo "--------------------------------------------------"

# --- 2. Установка зависимостей ---
print_info "Обновляем списки пакетов apt (тихий режим)..."
run_silent "Не удалось обновить списки пакетов." apt-get -y -qq update
print_info "Устанавливаем системные зависимости (включая cron)..."
run_silent "Не удалось установить зависимости." apt-get -y -qq install git python3 python3-pip curl ffmpeg cron
print_info "Устанавливаем Node.js v20.x..."
run_silent "Не удалось скачать скрипт Node.js." curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource_setup.sh
run_silent "Не удалось выполнить скрипт Node.js." bash /tmp/nodesource_setup.sh
run_silent "Не удалось установить Node.js." apt-get -y -qq install nodejs
rm /tmp/nodesource_setup.sh

# --- 3. Клонирование и настройка проекта ---
ORIGINAL_USER="${SUDO_USER:-$(whoami)}"
HOME_DIR=$(eval echo ~$ORIGINAL_USER)
PROJECT_DIR_FULL_PATH="$HOME_DIR/advanced-tiktok-downloader"
if [ ! -d "$PROJECT_DIR_FULL_PATH" ]; then
    print_info "Клонируем репозиторий..."
    run_silent "Не удалось клонировать репозиторий." sudo -u "$ORIGINAL_USER" git clone https://github.com/Rewixx-png/advanced-tiktok-downloader.git "$PROJECT_DIR_FULL_PATH"
else
    print_warning "Директория проекта уже существует."
fi
cd "$PROJECT_DIR_FULL_PATH" || print_error "Не удалось перейти в директорию проекта."

# Настройка Python API
print_info "Настраиваем Python API..."
cd python_api/ || print_error "Не найдена папка python_api."
mkdir -p audio_files video_cache
print_info "Устанавливаем Python-библиотеки..."
run_silent "Не удалось обновить pip." python3 -m pip install --upgrade pip
run_silent "Не удалось установить Python-библиотеки." python3 -m pip install TikTokApi fastapi "uvicorn[standard]" python-dotenv playwright httpx shazamio opencv-python-headless yt-dlp youtube-search-python aiosqlite
print_info "Скачиваем браузер для Playwright..."
run_silent "Не удалось установить браузер." python3 -m playwright install chromium
echo "MS_TOKEN=$MS_TOKEN" > .env

# Настройка Node.js Бота
print_info "Настраиваем Node.js бота..."
cd ../nodejs_bot/ || print_error "Не найдена папка nodejs_bot."
print_info "Устанавливаем Node.js зависимости..."
run_silent "Не удалось установить зависимости." npm install
echo "$TELEGRAM_TOKEN" > token.txt

# --- 4. Настройка PM2 ---
print_info "Настраиваем менеджер процессов PM2..."
cd ..
run_silent "Не удалось установить PM2." npm install -g pm2
print_info "Очищаем PM2 от старых процессов..."
# Удаляем старые процессы от имени пользователя, чтобы избежать проблем с правами
sudo -u "$ORIGINAL_USER" pm2 delete tiktok-api >> "$LOG_FILE" 2>&1 || true
sudo -u "$ORIGINAL_USER" pm2 delete tiktok-bot >> "$LOG_FILE" 2>&1 || true

print_info "Запускаем процессы через PM2 от имени пользователя '$ORIGINAL_USER'..."
run_silent "Не удалось запустить API." sudo -u "$ORIGINAL_USER" pm2 start python_api/api.py --name "tiktok-api" --interpreter python3
run_silent "Не удалось запустить бота." sudo -u "$ORIGINAL_USER" pm2 start nodejs_bot/bot.js --name "tiktok-bot"

print_info "Настраиваем автозапуск PM2..."
run_silent "Не удалось сохранить процессы PM2." sudo -u "$ORIGINAL_USER" pm2 save
# Надежный способ настройки автозапуска
PM2_STARTUP_CMD=$(pm2 startup systemd -u "$ORIGINAL_USER" --hp "$HOME_DIR" | grep 'sudo ')
if [[ -n "$PM2_STARTUP_CMD" ]]; then
    run_silent "Не удалось выполнить команду автозапуска PM2." eval "$PM2_STARTUP_CMD"
else
    print_warning "Не удалось получить команду автозапуска. Возможно, он уже настроен."
fi

# --- 5. Настройка CRON ---
print_info "Добавляем CRON-задачу для автоматической очистки кэша..."
PYTHON_PATH=$(which python3)
CLEANUP_SCRIPT_PATH="$PROJECT_DIR_FULL_PATH/python_api/cleanup.py"
LOG_FILE_PATH="$PROJECT_DIR_FULL_PATH/cleanup.log"
CRON_JOB="0 3 * * * $PYTHON_PATH $CLEANUP_SCRIPT_PATH >> $LOG_FILE_PATH 2>&1"
# Надежный способ добавления задачи через временный файл
CRON_FILE="/tmp/cron.tmp"
crontab -u "$ORIGINAL_USER" -l > "$CRON_FILE" 2>/dev/null
# Удаляем старую задачу, если она была
sed -i "\|$CLEANUP_SCRIPT_PATH|d" "$CRON_FILE"
# Добавляем новую
echo "$CRON_JOB" >> "$CRON_FILE"
# Устанавливаем обновленный файл crontab
crontab -u "$ORIGINAL_USER" "$CRON_FILE" || print_error "Не удалось настроить CRON-задачу."
rm "$CRON_FILE"

# --- Финальное сообщение ---
rm -f "$LOG_FILE"
print_success "Установка успешно завершена!"
echo "=================================================="
echo "Бот и API запущены и добавлены в автозагрузку."
echo "Проверьте их статус командой: sudo -u $ORIGINAL_USER pm2 ls"
echo "=================================================="
