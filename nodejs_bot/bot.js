// nodejs_bot/bot.js

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Конфигурация ---
const PYTHON_API_URL = 'http://127.0.0.1:18361/video_data';
const TOKEN_PATH = path.join(__dirname, 'token.txt');

// --- Словарь-переводчик для стран ---
const countryCodes = {
    'JP': 'Япония', 'US': 'США', 'RU': 'Россия', 'UA': 'Украина', 'BY': 'Беларусь',
    'KZ': 'Казахстан', 'KR': 'Южная Корея', 'DE': 'Германия', 'FR': 'Франция',
    'GB': 'Великобритания', 'BR': 'Бразилия', 'ID': 'Индонезия', 'VN': 'Вьетнам',
    'TH': 'Таиланд', 'TR': 'Турция', 'PH': 'Филиппины', 'PL': 'Польша',
    'IT': 'Италия', 'ES': 'Испания', 'CA': 'Канада', 'MX': 'Мексика',
};
const getCountryName = (code) => {
    if (!code) return null;
    return countryCodes[code.toUpperCase()] || code;
};

// --- Логирование ---
const log = (message) => {
    console.log(`[${new Date().toLocaleString('ru-RU')}] ${message}`);
};

// --- Чтение токена ---
if (!fs.existsSync(TOKEN_PATH)) {
    log('Критическая ошибка: Файл token.txt не найден!');
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

// --- ОБРАБОТЧИК ДЛЯ ССЫЛОК НА ВИДЕО ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;

    const tiktokUrlRegex = /(https?:\/\/(?:www\.)?(?:m|vt|vm)\.tiktok\.com\/[^\s]+)/;
    const match = text.match(tiktokUrlRegex);

    if (match && match[0]) {
        const tiktokUrl = match[0];
        log(`Обнаружена ссылка: ${tiktokUrl} в чате ${chatId}`);

        const waitingMessage = await bot.sendMessage(chatId, '⏳ Подождите, обрабатываю ссылку...', {
            reply_to_message_id: msg.message_id
        });

        try {
            const response = await axios.get(PYTHON_API_URL, {
                params: { original_url: tiktokUrl },
                timeout: 120000
            });

            const { metadata, videoBase64 } = response.data;
            log(`Получены данные от API для чата ${chatId}`);

            const stats = metadata.statistics;
            const videoDetails = metadata.video_details;
            const authorStats = metadata.authorStats;
            const shazam = metadata.shazam;

            let caption = `👤 <b>Автор:</b> <a href="https://www.tiktok.com/@${metadata.author.uniqueId}">@${metadata.author.uniqueId}</a>`;
            if (metadata.author.verified) caption += ` ✔️`;
            caption += `\n`;

            if (authorStats) {
                caption += `👥 <b>Подписчиков:</b> ${authorStats.followerCount?.toLocaleString('ru-RU') || 0}\n`;
                caption += `❤️ <b>Всего лайков:</b> ${authorStats.heartCount?.toLocaleString('ru-RU') || 0}\n`;
            }
            const regionName = getCountryName(metadata.region);
            if (regionName) caption += `📍 <b>Регион:</b> ${regionName}\n`;
            caption += '\n';

            if (metadata.description) caption += `📝 <b>Описание:</b>\n${metadata.description}\n\n`;
            if (metadata.hashtags && metadata.hashtags.length > 0) {
                 caption += `🏷️ <b>Хештеги:</b> ${metadata.hashtags.join(' ')}\n\n`;
            }

            caption += `🎵 <b>Музыка:</b> ${metadata.music.title}\n`;
            if (shazam && shazam.title) caption += `🎧 <b>Shazam:</b> ${shazam.artist} - ${shazam.title}\n`;
            caption += `\n`;

            caption += `📊 <b>Статистика видео:</b>\n`;
            caption += `  ❤️ Лайки: ${stats.diggCount?.toLocaleString('ru-RU') || 0}\n`;
            caption += `  💬 Комментарии: ${stats.commentCount?.toLocaleString('ru-RU') || 0}\n`;
            caption += `  🔁 Репосты: ${stats.shareCount?.toLocaleString('ru-RU') || 0}\n`;
            caption += `  ▶️ Просмотры: ${stats.playCount?.toLocaleString('ru-RU') || 0}\n\n`;

            caption += `⚙️ <b>Детали видео:</b>\n`;
            caption += `  Разрешение: ${videoDetails.resolution}\n`;
            caption += `  FPS: ${videoDetails.fps}\n`;
            caption += `  Размер: ${videoDetails.size_mb}\n`;
            if (metadata.video_duration) caption += `  ⏱️ Длительность: ${metadata.video_duration} сек.\n`;
            
            if (metadata.createTime) {
                const date = new Date(metadata.createTime * 1000);
                caption += `  📅 Опубликовано: ${date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}\n`;
            }
            if (metadata.isDuet) caption += `  🔗 Это дуэт\n`;
            if (metadata.isStitch) caption += `  ✂️ Сшито с другим видео\n`;

            const videoBuffer = Buffer.from(videoBase64, 'base64');
            await bot.sendVideo(chatId, videoBuffer, { caption: caption, parse_mode: 'HTML' });
            await bot.deleteMessage(chatId, waitingMessage.message_id);
            log(`Видео успешно отправлено в чат ${chatId}`);

        } catch (error) {
            log(`Произошла ошибка при обработке ссылки для чата ${chatId}`);
            let errorMessage = 'Произошла неизвестная ошибка. 😥';

            if (error.response) {
                log(`Ошибка от API: ${JSON.stringify(error.response.data, null, 2)}`);
                errorMessage = 'Не удалось обработать видео. Возможно, оно приватное или удалено. 😥';
            } else {
                log(`Сетевая ошибка или тайм-аут: ${error.message}`);
                errorMessage = 'Сервер слишком долго отвечает. Попробуйте позже.';
            }
            await bot.editMessageText(errorMessage, { chat_id: chatId, message_id: waitingMessage.message_id });
        }
    }
});