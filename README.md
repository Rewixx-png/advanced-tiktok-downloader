# Telegram Бот для Скачивания TikTok Видео с Полной Статистикой

Этот Telegram-бот позволяет скачивать видео из TikTok без водяных знаков и получать о них исчерпывающую информацию, включая реальную статистику (лайки, просмотры, комментарии и репосты).

## 🚀 Описание

Проект представляет собой надежную двухкомпонентную систему:
1.  **Node.js Бот (`nodejs_bot`)**: Основной клиент, который взаимодействует с пользователем в Telegram.
2.  **Python API (`python_api`)**: Мощный бэкенд-сервис, который эмулирует браузер для получения данных напрямую с сайта TikTok, обеспечивая максимальную надежность и полноту информации.

Такая архитектура решает главную проблему всех простых API — получение **актуальной и ненулевой статистики** по видео.

## ✨ Возможности

-   📥 Скачивание видео из TikTok без водяного знака.
-   📊 Получение **полной и реальной статистики**: лайки, просмотры, комментарии, репосты.
-   ℹ️ Отображение подробной информации: автор, описание, название музыки.
-   💬 Работает в групповых чатах (реагирует только на сообщения со ссылкой на TikTok).
-   🛡️ Надежная архитектура, устойчивая к изменениям в API TikTok.

## 🛠️ Инструкция по установке с нуля

Эта инструкция рассчитана на сервер под управлением **Ubuntu/Debian**.

### Шаг 0: Правильная установка Node.js

**Это самый важный шаг!** Стандартные репозитории Ubuntu/Debian содержат устаревшую версию `Node.js`, которая вызовет ошибки при запуске бота. Мы установим последнюю LTS-версию (с долгосрочной поддержкой).

1.  **Если у вас уже был установлен Node.js и возникли ошибки**, сначала полностью удалите старую версию, чтобы избежать конфликтов:
    ```bash
    sudo apt-get purge nodejs libnode-dev npm
    sudo apt autoremove -y
    ```

2.  **Установка актуальной версии Node.js (v20.x на момент написания):**
    Выполните эти команды, чтобы добавить официальный репозиторий NodeSource и установить Node.js.
    ```bash
    # Скачиваем и запускаем скрипт установки
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

    # Устанавливаем Node.js (npm установится вместе с ним)
    sudo apt-get install -y nodejs
    ```

3.  **Проверьте, что установка прошла успешно:**
    ```bash
    node -v
    # Ответ должен быть v20.x.x или выше
    ```

### Шаг 1: Установка остальных зависимостей и клонирование репозитория

```bash
# Устанавливаем git и Python, если их еще нет
sudo apt update && sudo apt install git python3 python3-pip -y

# Клонируем репозиторий
git clone https://github.com/Rewixx-png/advanced-tiktok-downloader.git
cd advanced-tiktok-downloader
```

### Шаг 2: Настройка Python API

Это "мозг" нашего бота, который получает данные с TikTok.

```bash
# Переходим в папку с Python API
cd python_api

# Устанавливаем зависимости
pip install -r requirements.txt

# Скачиваем браузер, которым будет управлять API (делается один раз)
python3 -m playwright install

# Создаем файл конфигурации
touch .env
```

Теперь откройте файл `.env` (`nano python_api/.env`) и добавьте в него ваш `ms_token`.

> **Как получить `ms_token`:**
> 1. Откройте `tiktok.com` в браузере на вашем компьютере.
> 2. Откройте Инструменты разработчика (клавиша F12).
> 3. Перейдите на вкладку "Application" (в Firefox - "Хранилище").
> 4. В меню слева выберите "Cookies" -> "https://www.tiktok.com".
> 5. Найдите в списке `ms_token` и скопируйте его значение.

Содержимое файла `.env` должно выглядеть так:
```
MS_TOKEN=скаоаовыф...длинный_токен...выфвфыв
```
**Важно:** Файл `.env` не будет загружен на GitHub, так как он добавлен в `.gitignore`.

### Шаг 3: Настройка Node.js Бота

Это "лицо" нашего бота, которое общается с пользователями в Telegram.

```bash
# Возвращаемся в корень проекта и переходим в папку бота
cd ../nodejs_bot

# Устанавливаем зависимости
npm install

# Создаем файл для токена
touch token.txt
```
Откройте файл `token.txt` (`nano nodejs_bot/token.txt`) и вставьте в него токен вашего Telegram-бота, полученный от [@BotFather](https://t.me/BotFather). **В файле не должно быть ничего, кроме токена!**

### Шаг 4: Запуск

Для работы бота нужно запустить **оба сервиса в двух разных терминалах** (например, используя `tmux` или `screen` для постоянной работы).

**Терминал 1: Запуск Python API**
```bash
cd /путь/до/проекта/python_api
python3 api.py
```
Дождитесь сообщения: `>>> Python API готов к приему запросов! <<<`. **Не закрывайте этот терминал.**

**Терминал 2: Запуск Node.js Бота**
```bash
cd /путь/до/проекта/nodejs_bot
node bot.js
```После этого ваш бот полностью готов к работе!

### Рекомендация: Запуск через PM2

Для того чтобы бот и API работали 24/7, рекомендуется использовать менеджер процессов `pm2`.

```bash
# Установка pm2
sudo npm install -g pm2

# Запуск Python API
pm2 start "python3 api.py" --name tiktok-api --cwd /путь/до/проекта/python_api

# Запуск Node.js бота
pm2 start bot.js --name tiktok-bot --cwd /путь/до/проекта/nodejs_bot

# Сохранение процессов для автозапуска после перезагрузки
pm2 save
sudo pm2 startup
```
Скопируйте и выполните команду, которую выдаст `pm2 startup`, чтобы настроить автозапуск.

---