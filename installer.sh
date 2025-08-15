#!/bin/bash

# =================================================================
#      Advanced TikTok Downloader - Универсальный установщик
# =================================================================
# Этот скрипт автоматически установит и настроит все компоненты
# бота, включая Python API, Node.js бота, менеджер процессов PM2
# и задачу автоматической очистки кэша.
#
# Запускать на чистых системах Ubuntu/Debian.
# =================================================================

# --- Вспомогательные функции для красивого вывода ---
print_info() {
    # Синий цвет для информационных сообщений
    echo -e "\e[34mINFO:\e[0m $1"
}

print_success() {
    # Зеленый цвет для сообщений об успехе
    echo -e "\e[32mSUCCESS:\e[0m $1"
}

print_warning() {
    # Желтый цвет для предупреждений
    echo -e "\e[33mWARNING:\e[0m $1"
}

print_error() {
    # Красный цвет для ошибок
    echo -e "\e[31mERROR:\e[0m $1"
    exit 1
}

# --- 1. Проверка прав суперпользователя ---
if [ "$EUID" -ne 0 ]; then
    print_error "Пожалуйста, запустите этот скрипт с правами суперпользователя (sudo bash installer.sh)"
fi

clear
print_info "Добро пожаловать в установщик Advanced TikTok Downloader!"
echo "--------------------------------------------------"

# --- 2. Запрос необходимых данных у пользователя ---
read -p "Введите ваш токен для Telegram-бота от @BotFather: " TELEGRAM_TOKEN
if [ -z "$TELEGRAM_TOKEN" ]; then
    print_error "Токен Telegram не может быть пустым."
fi

read -p "Введите ваш ms_token для TikTok (инструкция в README): " MS_TOKEN
if [ -z "$MS_TOKEN" ]; then
    print_error "ms_token не может быть пустым."
fi
echo "--------------------------------------------------"

# --- 3. Установка системных зависимостей ---
print_info "Обновляем списки пакетов apt..."
apt-get update -y

print_info "Устанавливаем системные зависимости (git, python3, pip, curl, ffmpeg)..."
# ffmpeg ОБЯЗАТЕЛЕН для скачивания аудио из YouTube с помощью yt-dlp
apt-get install -y git python3 python3-pip curl ffmpeg

# --- 4. Установка Node.js 20.x ---
print_info "Устанавливаем Node.js v20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# --- 5. Клонирование репозитория ---
# Определяем директорию проекта в домашней папке пользователя, который запустил sudo
PROJECT_DIR="${SUDO_USER:-$(whoami)}/advanced-tiktok-downloader"
PROJECT_DIR_FULL_PATH="/home/$PROJECT_DIR"

if [ -d "$PROJECT_DIR_FULL_PATH" ]; then
    print_warning "Директория проекта уже существует. Пропускаем клонирование."
else
    print_info "Клонируем репозиторий в $PROJECT_DIR_FULL_PATH..."
    # Клонируем от имени пользователя, а не от root
    sudo -u "${SUDO_USER:-$(whoami)}" git clone https://github.com/Rewixx-png/advanced-tiktok-downloader.git "$PROJECT_DIR_FULL_PATH" || print_error "Не удалось клонировать репозиторий."
fi
cd "$PROJECT_DIR_FULL_PATH" || print_error "Не удалось перейти в директорию проекта."

# --- 6. Настройка Python API ---
print_info "Настраиваем Python API..."
cd python_api/ || print_error "Не найдена папка python_api."

print_info "Создаем необходимые папки: audio_files и video_cache..."
mkdir -p audio_files video_cache

print_info "Устанавливаем Python-библиотеки (это может занять некоторое время)..."
# Устанавливаем все зависимости, включая новые для кэширования и скачивания музыки
pip install --upgrade pip
pip install TikTokApi fastapi "uvicorn[standard]" python-dotenv playwright httpx shazamio opencv-python-headless yt-dlp youtube-search-python aiosqlite || print_error "Не удалось установить Python-библиотеки."

print_info "Скачиваем браузер для Playwright (это может занять несколько минут)..."
python3 -m playwright install chromium || print_error "Не удалось установить браузер для Playwright."

print_info "Создаем файл конфигурации .env..."
echo "MS_TOKEN=$MS_TOKEN" > .env

# --- 7. Настройка Node.js Бота ---
print_info "Настраиваем Node.js бота..."
cd ../nodejs_bot/ || print_error "Не найдена папка nodejs_bot."

print_info "Устанавливаем Node.js зависимости..."
npm install || print_error "Не удалось установить Node.js зависимости."

print_info "Создаем файл с токеном Telegram..."
echo "$TELEGRAM_TOKEN" > token.txt

# --- 8. Настройка PM2 для автозапуска ---
print_info "Настраиваем менеджер процессов PM2..."
cd .. # Возвращаемся в корень проекта
npm install -g pm2 || print_error "Не удалось установить PM2."

print_info "Запускаем процессы через PM2..."
# Запускаем от имени пользователя, чтобы избежать проблем с правами
sudo -u "${SUDO_USER:-$(whoami)}" pm2 start python_api/api.py --name "tiktok-api" --interpreter python3
sudo -u "${SUDO_USER:-$(whoami)}" pm2 start nodejs_bot/bot.js --name "tiktok-bot"

print_info "Сохраняем процессы для автозапуска после перезагрузки..."
sudo -u "${SUDO_USER:-$(whoami)}" pm2 save
# Генерируем и выполняем команду для автозапуска PM2
env PATH=$PATH:/usr/bin pm2 startup systemd -u "${SUDO_USER:-$(whoami)}" --hp "/home/${SUDO_USER:-$(whoami)}" | tail -n 1 | bash

# --- 9. Настройка CRON-задачи для очистки кэша ---
print_info "Добавляем CRON-задачу для автоматической очистки кэша (каждую ночь в 3:00)..."
PYTHON_PATH=$(which python3)
CLEANUP_SCRIPT_PATH="$PROJECT_DIR_FULL_PATH/python_api/cleanup.py"
LOG_FILE_PATH="$PROJECT_DIR_FULL_PATH/cleanup.log"

CRON_CMD="$PYTHON_PATH $CLEANUP_SCRIPT_PATH >> $LOG_FILE_PATH 2>&1"
CRON_JOB="0 3 * * * $CRON_CMD"

# Добавляем задачу в crontab пользователя, а не root
(crontab -u "${SUDO_USER:-$(whoami)}" -l 2>/dev/null | grep -v -F "$CLEANUP_SCRIPT_PATH" ; echo "$CRON_JOB") | crontab -u "${SUDO_USER:-$(whoami)}" -

print_success "Установка успешно завершена!"
echo "=================================================="
echo "Бот и API запущены и добавлены в автозагрузку."
echo "Вы можете проверить их статус командой: pm2 ls"
echo "Логи можно посмотреть так: pm2 logs tiktok-api или pm2 logs tiktok-bot"
echo "Задача очистки кэша добавлена в CRON и будет запускаться каждую ночь."
echo "=================================================="
