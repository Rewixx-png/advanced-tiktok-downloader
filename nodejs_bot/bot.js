// nodejs_bot/bot.js

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Конфигурация ---
// API должен быть доступен по этому адресу. 127.0.0.1 - это localhost.
const PYTHON_API_URL = 'http://127.0.0.1:18361/video_data';
const TOKEN_PATH = path.join(__dirname, 'token.txt');

// --- Логирование для отладки ---
const log = (message) => {
    console.log(`[${new Date().toLocaleString('ru-RU')}] ${message}`);
};

// --- Проверка и чтение токена ---
if (!fs.existsSync(TOKEN_PATH)) {
    log('Критическая ошибка: Файл token.txt не найден!');
    log('Пожалуйста, создайте файл token.txt в папке nodejs_bot и поместите в него токен вашего Telegram-бота.');
    process.exit(1);
}
const token = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
if (!token) {
    log('Критическая ошибка: Файл token.txt пуст!');
    process.exit(1);
}

// --- Инициализация бота ---
const bot = new TelegramBot(token, { polling: true });
log('Бот успешно запущен и готов к работе!');

// --- Основной обработчик сообщений ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    // Ищем ссылки на TikTok в тексте сообщения с помощью регулярного выражения
    const tiktokUrlRegex = /(https?:\/\/(?:www\.)?(?:m|vt|vm)\.tiktok\.com\/[^\s]+)/;
    const match = text.match(tiktokUrlRegex);

    if (match && match[0]) {
        const tiktokUrl = match[0];
        log(`Обнаружена ссылка: ${tiktokUrl} в чате ${chatId}`);

        // Отправляем пользователю сообщение о начале обработки
        const waitingMessage = await bot.sendMessage(chatId, '⏳ Подождите, обрабатываю ссылку...', {
            reply_to_message_id: msg.message_id
        });

        try {
            // --- Вызов Python API ---
            // ГЛАВНОЕ ИСПРАВЛЕНИЕ: используем параметр 'original_url', как ожидает API
            const response = await axios.get(PYTHON_API_URL, {
                params: {
                    original_url: tiktokUrl
                },
                timeout: 120000 // Тайм-аут 2 минуты, так как API может работать долго
            });

            const { metadata, videoBase64 } = response.data;
            log(`Получены данные от API для чата ${chatId}`);

            // Формируем красивое описание для видео
            const stats = metadata.statistics;
            const videoDetails = metadata.video_details;
            const shazam = metadata.shazam;

            let caption = `<b>Автор:</b> <a href="https://www.tiktok.com/@${metadata.author.uniqueId}">${metadata.author.nickname}</a>\n`;
            if (metadata.description) {
                caption += `<b>Описание:</b> ${metadata.description}\n\n`;
            }

            caption += `<b>📊 Статистика:</b>\n`;
            caption += `  ❤️ Лайки: ${stats.diggCount?.toLocaleString('ru-RU') || 0}\n`;
            caption += `  💬 Комментарии: ${stats.commentCount?.toLocaleString('ru-RU') || 0}\n`;
            caption += `  🔁 Репосты: ${stats.shareCount?.toLocaleString('ru-RU') || 0}\n`;
            caption += `  ▶️ Просмотры: ${stats.playCount?.toLocaleString('ru-RU') || 0}\n\n`;

            if (shazam && shazam.title) {
                 caption += `<b>🎵 Музыка (Shazam):</b> ${shazam.artist} - ${shazam.title}\n`;
            } else {
                 caption += `<b>🎵 Музыка:</b> ${metadata.music.title} - ${metadata.music.authorName}\n`;
            }

            caption += `\n<b>⚙️ Детали видео:</b> ${videoDetails.resolution}, ${videoDetails.size_mb}`;

            // Декодируем видео из base64
            const videoBuffer = Buffer.from(videoBase64, 'base64');

            // Отправляем видео с подписью
            await bot.sendVideo(chatId, videoBuffer, {
                caption: caption,
                parse_mode: 'HTML'
            });

            // Удаляем сообщение "Подождите..."
            await bot.deleteMessage(chatId, waitingMessage.message_id);
            log(`Видео успешно отправлено в чат ${chatId}`);

        } catch (error) {
            log(`Произошла ошибка при обработке ссылки для чата ${chatId}`);
            let errorMessage = 'Произошла неизвестная ошибка. 😥';

            if (error.response) {
                // Ошибка пришла от API
                log(`Ошибка от API: ${JSON.stringify(error.response.data, null, 2)}`);
                const apiErrorDetail = error.response.data.detail;
                if (typeof apiErrorDetail === 'string' && apiErrorDetail.includes("Неверный формат ссылки")) {
                    errorMessage = 'Это не похоже на рабочую ссылку на TikTok. Попробуйте другую.';
                } else {
                    errorMessage = 'Не удалось обработать видео. Возможно, оно приватное или удалено. 😥';
                }
            } else {
                // Сетевая ошибка или тайм-аут
                log(`Сетевая ошибка или тайм-аут: ${error.message}`);
                 errorMessage = 'Сервер слишком долго отвечает. Попробуйте позже.';
            }

            // Редактируем сообщение об ожидании на сообщение об ошибке
            await bot.editMessageText(errorMessage, {
                chat_id: chatId,
                message_id: waitingMessage.message_id
            });
        }
    }
});