#!/bin/bash
set -e # Выходить из скрипта при любой ошибке

# --- Цвета для красивого вывода ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# --- Хелперы для вывода сообщений ---
print_info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}
print_success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}
print_warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}
print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}
print_header() {
    printf "\n%s\n" "========================================================================"
    echo -e "${CYAN}$1${NC}"
    printf "%s\n" "========================================================================"
}

# --- Красивый баннер ---
clear
echo -e "${CYAN}"
cat << "EOF"
    ████████╗██╗  ██╗██╗  ██╗██╗  ██╗ █████╗  ██████╗
    ╚══██╔══╝██║  ██║██║ ██╔╝██║  ██║██╔══██╗██╔════╝
       ██║   ███████║█████╔╝ ███████║███████║██║
       ██║   ██╔══██║██╔═██╗ ██╔══██║██╔══██║██║
       ██║   ██║  ██║██║  ██╗██║  ██║██║  ██║╚██████╗
       ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝
             Advanced TikTok Downloader Installer
EOF
echo -e "${NC}"

# --- Проверка на запуск от рута ---
if [ "$EUID" -ne 0 ]; then
  print_error "Пожалуйста, запустите этот скрипт с правами суперпользователя (sudo bash $0)"
  exit 1
fi

print_info "Добро пожаловать! Этот скрипт установит и настроит для вас TikTok-бота."
sleep 2

# --- ШАГ 1: СИСТЕМНЫЕ ЗАВИСИМОСТИ ---
print_header "Шаг 1: Установка системных зависимостей (git, python, pip, curl)"
apt-get update -y
apt-get install -y git python3 python3-pip curl
print_success "Системные зависимости установлены!"
sleep 1

# --- ШАГ 2: УСТАНОВКА NODE.JS ---
print_header "Шаг 2: Установка правильной версии Node.js"
print_info "Удаляем старые версии Node.js, чтобы избежать конфликтов..."
apt-get purge -y nodejs npm
apt-get autoremove -y
print_info "Добавляем репозиторий NodeSource для Node.js v20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
print_info "Устанавливаем Node.js..."
apt-get install -y nodejs
NODE_VERSION=$(node -v)
print_success "Node.js ${NODE_VERSION} успешно установлен."
sleep 1

# --- ШАГ 3: КЛОНИРОВАНИЕ РЕПОЗИТОРИЯ ---
print_header "Шаг 3: Клонирование проекта с GitHub"
if [ -d "advanced-tiktok-downloader" ]; then
    print_warning "Папка 'advanced-tiktok-downloader' уже существует. Пропускаем клонирование."
else
    print_info "Клонируем репозиторий..."
    git clone https://github.com/Rewixx-png/advanced-tiktok-downloader.git
    print_success "Репозиторий успешно склонирован."
fi
cd advanced-tiktok-downloader || exit
PROJECT_DIR=$(pwd)
sleep 1

# --- ШАГ 4: ЗАПРАШИВАЕМ ТОКЕНЫ У ПОЛЬЗОВАТЕЛЯ ---
print_header "Шаг 4: Настройка конфигурации"
print_info "Теперь нужно задать два токена."

read -p "$(echo -e ${YELLOW}"Введите токен вашего Telegram-бота (от BotFather): "${NC})" TELEGRAM_TOKEN
while [ -z "$TELEGRAM_TOKEN" ]; do
    print_error "Токен не может быть пустым. Пожалуйста, попробуйте еще раз."
    read -p "$(echo -e ${YELLOW}"Введите токен вашего Telegram-бота (от BotFather): "${NC})" TELEGRAM_TOKEN
done

print_info "\nТеперь нам нужен ms_token от TikTok. Инструкция по получению:"
echo "1. Откройте tiktok.com в браузере на компьютере."
echo "2. Нажмите F12, чтобы открыть Инструменты разработчика."
echo "3. Перейдите на вкладку 'Application' (или 'Хранилище')."
echo "4. Слева выберите 'Cookies' -> 'https://www.tiktok.com'."
echo "5. Найдите в списке 'ms_token' и скопируйте его значение."
read -p "$(echo -e ${YELLOW}"Введите ваш ms_token: "${NC})" MS_TOKEN
while [ -z "$MS_TOKEN" ]; do
    print_error "ms_token не может быть пустым. Пожалуйста, попробуйте еще раз."
    read -p "$(echo -e ${YELLOW}"Введите ваш ms_token: "${NC})" MS_TOKEN
done
print_success "Токены приняты!"
sleep 1

# --- ШАГ 5: НАСТРОЙКА PYTHON API ---
print_header "Шаг 5: Настройка Python API"
print_info "Устанавливаем зависимости для Python..."
pip install -r "$PROJECT_DIR/python_api/requirements.txt"
print_info "Скачиваем браузер для Playwright (это может занять некоторое время)..."
python3 -m playwright install chromium
print_info "Создаем файл конфигурации .env..."
echo "MS_TOKEN=$MS_TOKEN" > "$PROJECT_DIR/python_api/.env"
print_success "Python API настроен!"
sleep 1

# --- ШАГ 6: НАСТРОЙКА NODE.JS БОТА ---
print_header "Шаг 6: Настройка Node.js бота"
print_info "Устанавливаем зависимости для Node.js..."
cd "$PROJECT_DIR/nodejs_bot"
npm install
print_info "Создаем файл с токеном..."
echo "$TELEGRAM_TOKEN" > token.txt
cd "$PROJECT_DIR"
print_success "Node.js бот настроен!"
sleep 1

# --- ШАГ 7: УСТАНОВКА И ЗАПУСК ЧЕРЕЗ PM2 ---
print_header "Шаг 7: Установка и запуск через PM2"
print_info "Устанавливаем менеджер процессов PM2..."
npm install -g pm2

# ИСПРАВЛЕНИЕ: Обновляем PATH, чтобы система сразу нашла pm2
export PATH=$(npm bin -g):$PATH

print_info "Запускаем Python API и Node.js бота..."
pm2 start "$PROJECT_DIR/python_api/api.py" --name "tiktok-api" --interpreter python3
pm2 start "$PROJECT_DIR/nodejs_bot/bot.js" --name "tiktok-bot"
print_info "Сохраняем процессы для автозапуска..."
pm2 save
print_success "Бот и API успешно запущены через PM2!"
sleep 1

# --- ШАГ 8: ФИНАЛЬНЫЕ ИНСТРУКЦИИ ---
print_header "УСТАНОВКА ЗАВЕРШЕНА!"
print_info "Ваш бот для скачивания видео из TikTok готов к работе."
echo ""
echo -e "${YELLOW}--- Как управлять ботом ---${NC}"
echo "Мы используем PM2 - это менеджер, который следит, чтобы бот работал 24/7."
echo ""
echo -e "  ${CYAN}pm2 ls${NC}              - Посмотреть список запущенных процессов (бота и API)."
echo -e "  ${CYAN}pm2 logs tiktok-bot${NC} - Посмотреть логи Telegram-бота."
echo -e "  ${CYAN}pm2 logs tiktok-api${NC} - Посмотреть логи Python API (полезно для отладки)."
echo -e "  ${CYAN}pm2 restart all${NC}     - Перезапустить бота и API."
echo -e "  ${CYAN}pm2 stop all${NC}        - Остановить бота и API."
echo ""
print_warning "ВАЖНЫЙ ПОСЛЕДНИЙ ШАГ: Автозапуск после перезагрузки сервера."
print_info "Чтобы бот запускался сам после перезагрузки сервера, вам нужно один раз выполнить команду, которую сгенерирует PM2."
print_info "Скопируйте команду ниже и выполните ее в терминале:"
echo ""
STARTUP_COMMAND=$(pm2 startup | tail -n 1)
echo -e "${GREEN}${STARTUP_COMMAND}${NC}"
echo ""
print_info "После выполнения этой команды ваш сервер будет полностью настроен."
echo -e "\n${GREEN}Удачи с ботом, бро! 😎${NC}\n"
