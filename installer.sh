#!/bin/bash

# =================================================================
#      Advanced TikTok Downloader - "Тихий" установщик v3.0
# =================================================================
# Скрипт показывает только ключевые этапы установки. Детальный
# вывод скрыт, но будет показан автоматически в случае ошибки.
# =================================================================

# --- Вспомогательные функции для красивого вывода ---
print_info() { echo -e "\e[34mINFO:\e[0m $1"; }
print_success() { echo -e "\e[32mSUCCESS:\e[0m $1"; }
print_warning() { echo -e "\e[33mWARNING:\e[0m $1"; }
print_error() { echo -e "\e[31mERROR:\e[0m $1"; }

# --- Лог-файл для скрытого вывода ---
LOG_FILE="/tmp/tiktok_installer.log"
# Очищаем лог-файл перед началом
> "$LOG_FILE"

# --- Функция для тихого выполнения команд ---
# Выполняет команду, скрывая ее вывод. В случае ошибки, показывает лог.
run_silent() {
    local message="$1"
    shift
    local command_to_run="$@"

    # Выполняем команду, перенаправляя весь вывод в лог-файл
    if ! eval "$command_to_run" >> "$LOG_FILE" 2>&1; then
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
print_info "Добро пожаловать в 'тихий' установщик Advanced TikTok Downloader v3.0!"
echo "--------------------------------------------------"

# --- 2. Запрос необходимых данных у пользователя ---
read -p "Введите ваш токен для Telegram-бота от @BotFather: " TELEGRAM_TOKEN
if [ -z "$TELEGRAM_TOKEN" ]; then print_error "Токен Telegram не может быть пустым."; fi

read -p "Введите ваш ms_token для TikTok (инструкция в README): " MS_TOKEN
if [ -z "$MS_TOKEN" ]; then print_error "ms_token не может быть пустым."; fi
echo "--------------------------------------------------"

# --- 3. Установка системных зависимостей ---
print_info "Обновляем списки пакетов apt..."
run_silent "Не удалось обновить списки пакетов." "apt-get update -y"

print_info "Устанавливаем системные зависимости (git, python3, pip, curl, ffmpeg)..."
run_silent "Не удалось установить системные зависимости." "apt-get install -y git python3 python3-pip curl ffmpeg"

# --- 4. Установка Node.js 20.x ---
print_info "Устанавливаем Node.js v20.x..."
run_silent "Не удалось добавить репозиторий Node.js." "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
run_silent "Не удалось установить Node.js." "apt-get install -y nodejs"

# --- 5. Клонирование репозитория ---
ORIGINAL_USER="${SUDO_USER:-$(whoami)}"
PROJECT_DIR_FULL_PATH="/home/$ORIGINAL_USER/advanced-tiktok-downloader"

if [ -d "$PROJECT_DIR_FULL_PATH" ]; then
    print_warning "Директория проекта уже существует. Пропускаем клонирование."
else
    print_info "Клонируем репозиторий в $PROJECT_DIR_FULL_PATH..."
    run_silent "Не удалось клонировать репозиторий." "sudo -u \"$ORIGINAL_USER\" git clone https://github.com/Rewixx-png/advanced-tiktok-downloader.git \"$PROJECT_DIR_FULL_PATH\""
fi
cd "$PROJECT_DIR_FULL_PATH" || print_error "Не удалось перейти в директорию проекта."

# --- 6. Настройка Python API ---
print_info "Настраиваем Python API..."
cd python_api/ || print_error "Не найдена папка python_api."
mkdir -p audio_files video_cache

print_info "Устанавливаем Python-библиотеки (это может занять некоторое время)..."
run_silent "Не удалось установить Python-библиотеки." "pip install --upgrade pip"
run_silent "Не удалось установить Python-библиотеки." "pip install TikTokApi fastapi \"uvicorn[standard]\" python-dotenv playwright httpx shazamio opencv-python-headless yt-dlp youtube-search-python aiosqlite"

print_info "Скачиваем браузер для Playwright (это может занять несколько минут)..."
run_silent "Не удалось установить браузер для Playwright." "python3 -m playwright install chromium"

print_info "Создаем файл конфигурации .env..."
echo "MS_TOKEN=$MS_TOKEN" > .env

# --- 7. Настройка Node.js Бота ---
print_info "Настраиваем Node.js бота..."
cd ../nodejs_bot/ || print_error "Не найдена папка nodejs_bot."

print_info "Устанавливаем Node.js зависимости..."
run_silent "Не удалось установить Node.js зависимости." "npm install"

print_info "Создаем файл с токеном Telegram..."
echo "$TELEGRAM_TOKEN" > token.txt

# --- 8. Настройка PM2 для автозапуска ---
print_info "Настраиваем менеджер процессов PM2..."
cd .. # Возвращаемся в корень проекта
run_silent "Не удалось установить PM2." "npm install -g pm2"

print_info "Останавливаем и удаляем любые старые версии процессов..."
# Используем `|| true`, чтобы скрипт не падал, если процессов еще не существует
run_silent "Не удалось остановить старые процессы." "pm2 stop tiktok-api || true; pm2 delete tiktok-api || true; pm2 stop tiktok-bot || true; pm2 delete tiktok-bot || true"

print_info "Запускаем процессы через PM2 от имени пользователя '$ORIGINAL_USER'..."
run_silent "Не удалось запустить процессы." "sudo -u \"$ORIGINAL_USER\" pm2 start python_api/api.py --name \"tiktok-api\" --interpreter python3 && sudo -u \"$ORIGINAL_USER\" pm2 start nodejs_bot/bot.js --name \"tiktok-bot\""

print_info "Сохраняем процессы для автозапуска после перезагрузки..."
run_silent "Не удалось сохранить процессы PM2." "sudo -u \"$ORIGINAL_USER\" pm2 save"
run_silent "Не удалось настроить автозапуск PM2." "env PATH=\$PATH:/usr/bin pm2 startup systemd -u \"$ORIGINAL_USER\" --hp \"/home/$ORIGINAL_USER\" | tail -n 1 | bash"

# --- 9. Настройка CRON-задачи для очистки кэша ---
print_info "Добавляем CRON-задачу для автоматической очистки кэша..."
PYTHON_PATH=$(which python3)
CLEANUP_SCRIPT_PATH="$PROJECT_DIR_FULL_PATH/python_api/cleanup.py"
LOG_FILE_PATH="$PROJECT_DIR_FULL_PATH/cleanup.log"
CRON_CMD="$PYTHON_PATH $CLEANUP_SCRIPT_PATH >> $LOG_FILE_PATH 2>&1"
CRON_JOB="0 3 * * * $CRON_CMD"
run_silent "Не удалось настроить CRON-задачу." "(crontab -u \"$ORIGINAL_USER\" -l 2>/dev/null | grep -v -F \"$CLEANUP_SCRIPT_PATH\" ; echo \"$CRON_JOB\") | crontab -u \"$ORIGINAL_USER\" -"

# --- Финальное сообщение ---
rm -f "$LOG_FILE" # Очищаем временный лог
print_success "Установка успешно завершена!"
echo "=================================================="
echo "Бот и API запущены и добавлены в автозагрузку."
echo "Вы можете проверить их статус командой: pm2 ls"
echo "Логи можно посмотреть так: pm2 logs tiktok-api или pm2 logs tiktok-bot"
echo "=================================================="
