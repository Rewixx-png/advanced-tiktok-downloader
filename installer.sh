#!/bin/bash
# Advanced TikTok Downloader - Universal Installer (Updated 2025)
# This script automates the full installation process on Debian/Ubuntu systems,
# including all fixes and dependencies discovered during our debugging session.

# --- Функции для цветного вывода ---
print_info() { echo -e "\e[34m[INFO]\e[0m $1"; }
print_success() { echo -e "\e[32m[SUCCESS]\e[0m $1"; }
print_warning() { echo -e "\e[33m[WARNING]\e[0m $1"; }
print_error() { echo -e "\e[31m[ERROR]\e[0m $1"; }

# --- Проверка на запуск от имени root ---
if [ "$EUID" -ne 0 ]; then
  print_error "Пожалуйста, запустите этот скрипт с правами sudo: sudo bash $0"
  exit 1
fi

# --- Определяем пользователя и его домашнюю директорию ---
ORIGINAL_USER=${SUDO_USER:-$(who am i | awk '{print $1}')}
HOME_DIR=$(eval echo ~$ORIGINAL_USER)
PROJECT_DIR="$HOME_DIR/advanced-tiktok-downloader"

# --- Приветствие и подтверждение ---
clear
print_info "Запуск универсального установщика Advanced TikTok Downloader."
print_warning "Этот скрипт установит Node.js 20.x, Python, FFmpeg и другие зависимости."
print_warning "Он также склонирует репозиторий проекта в директорию: $PROJECT_DIR"
read -p "Вы уверены, что хотите продолжить? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Установка отменена."
    exit 1
fi

# --- Шаг 1: Установка системных зависимостей ---
print_info "Обновление списка пакетов и установка системных зависимостей..."
apt-get update
apt-get install -y git python3 python3-pip curl ffmpeg || { print_error "Не удалось установить базовые пакеты. Прерывание."; exit 1; }
print_success "Системные зависимости установлены."

# --- Шаг 2: Установка Node.js 20.x ---
print_info "Установка Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs || { print_error "Не удалось установить Node.js. Прерывание."; exit 1; }
print_success "Node.js успешно установлен."

# --- Шаг 3: Клонирование репозитория проекта ---
print_info "Клонирование репозитория проекта в $PROJECT_DIR..."
if [ -d "$PROJECT_DIR" ]; then
    print_warning "Директория проекта уже существует. Пропускаем клонирование."
else
    sudo -u "$ORIGINAL_USER" git clone https://github.com/Rewixx-png/advanced-tiktok-downloader.git "$PROJECT_DIR" || { print_error "Не удалось клонировать репозиторий. Прерывание."; exit 1; }
fi
cd "$PROJECT_DIR" || { print_error "Не удалось перейти в директорию проекта. Прерывание."; exit 1; }
print_success "Репозиторий успешно склонирован."

# --- Шаг 4: Настройка Python окружения ---
print_info "Настройка Python окружения и установка зависимостей..."
# Создаем и записываем правильный requirements.txt
cat << EOF > python_api/requirements.txt
TikTokApi
fastapi==0.111.0
uvicorn==0.30.1
python-dotenv==1.0.1
playwright==1.44.0
httpx==0.27.0
shazamio
opencv-python-headless
yt-dlp
aiosqlite
EOF

python3 -m pip install --upgrade pip
python3 -m pip install -r python_api/requirements.txt || { print_error "Не удалось установить Python-зависимости. Прерывание."; exit 1; }
print_info "Установка браузера для Playwright (это может занять несколько минут)..."
python3 -m playwright install chromium || { print_error "Не удалось установить браузер Playwright. Прерывание."; exit 1; }
print_success "Python окружение настроено."

# --- Шаг 5: Настройка Node.js окружения ---
print_info "Настройка Node.js окружения и установка зависимостей..."
cd nodejs_bot
npm install || { print_error "Не удалось установить Node.js-зависимости. Прерывание."; exit 1; }
cd ..
print_success "Node.js окружение настроено."

# --- Шаг 6: Интерактивная настройка ---
print_info "Настройка бота. Пожалуйста, ответьте на вопросы."

# Запрос Telegram токена
read -p "➡️ Введите ваш Telegram Bot Token (от BotFather): " TELEGRAM_TOKEN
echo "$TELEGRAM_TOKEN" > nodejs_bot/token.txt

# Запрос TikTok ms_token
print_info "Теперь нужно получить TikTok ms_token."
print_info "Инструкция: Откройте tiktok.com в браузере -> F12 -> Application/Хранилище -> Cookies -> https://www.tiktok.com -> найдите ms_token."
read -p "➡️ Введите ваш TikTok ms_token: " MS_TOKEN
echo "MS_TOKEN=$MS_TOKEN" > python_api/.env

# Устанавливаем права на созданные файлы для пользователя
chown "$ORIGINAL_USER:$ORIGINAL_USER" nodejs_bot/token.txt python_api/.env
print_success "Файлы конфигурации созданы."

# --- Шаг 7: Настройка PM2 для работы 24/7 ---
print_info "Настройка PM2 для автозапуска и работы в фоновом режиме..."
npm install -g pm2 || { print_error "Не удалось установить PM2. Прерывание."; exit 1; }
pm2 start python_api/api.py --name "tiktok-api" --interpreter python3
pm2 start nodejs_bot/bot.js --name "tiktok-bot"
pm2 save
STARTUP_COMMAND=$(pm2 startup | tail -n 1)

print_success "PM2 успешно настроен."

# --- Финальные инструкции ---
echo
print_success "🎉 Установка успешно завершена! 🎉"
echo
print_warning "‼️ ВАЖНО: Чтобы бот автоматически запускался после перезагрузки сервера,"
print_warning "скопируйте и выполните следующую команду от имени root:"
echo
echo -e "  \e[32m$STARTUP_COMMAND\e[0m"
echo
print_info "Полезные команды:"
print_info "  pm2 logs tiktok-api  - посмотреть логи Python API."
print_info "  pm2 logs tiktok-bot  - посмотреть логи Telegram бота."
print_info "  pm2 restart all      - перезапустить обоих ботов."
print_info "  pm2 stop all         - остановить обоих ботов."
echo
