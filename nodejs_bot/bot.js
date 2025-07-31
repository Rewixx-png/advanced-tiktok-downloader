const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- НАСТРОЙКИ ---

const tokenPath = path.join(__dirname, 'token.txt');
if (!fs.existsSync(tokenPath)) {
    console.error('Ошибка: Файл token.txt не найден! Пожалуйста, создайте его и вставьте туда токен вашего бота.');
    process.exit(1);
}
const token = fs.readFileSync(tokenPath, 'utf8').trim();

const API_URL = 'http://127.0.0.1:18361/video_data';

// --- ИНИЦИАЛИЗАЦИЯ БОТА ---

const bot = new TelegramBot(token, { polling: true });
console.log('Бот успешно запущен и готов к работе!');

// --- ИЗМЕНЕНИЕ И УЛУЧШЕНИЕ: Универсальное регулярное выражение для ВСЕХ ссылок ---
const TIKTOK_URL_REGEX = /https?:\/\/(?:[a-zA-Z]{2,3}\.)?tiktok\.com\/((?:@[-a-zA-Z0-9._]{1,256}\/video\/[0-9]+)|(?:t\/[a-zA-Z0-9]+)|(?:[a-zA-Z0-9]{9,}))\/?/g;


// --- ОСНОВНАЯ ЛОГИКА ---

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;
    
    // Сбрасываем состояние regex перед каждым новым поиском
    TIKTOK_URL_REGEX.lastIndex = 0; 
    const match = TIKTOK_URL_REGEX.exec(text);
    
    if (!match) return;

    const tiktokUrl = match[0];
    console.log(`[${new Date().toLocaleString()}] Обнаружена ссылка: ${tiktokUrl} в чате ${chatId}`);

    let processingMessage;
    try {
        processingMessage = await bot.sendMessage(chatId, '⏳ Обрабатываю запрос...', {
            reply_to_message_id: msg.message_id
        });

        const response = await axios.get(API_URL, {
            params: { url: tiktokUrl },
            timeout: 180000 
        });
        
        const { metadata, videoBase64 } = response.data;

        if (!videoBase64) {
            throw new Error('API did not return video data.');
        }

        const videoBuffer = Buffer.from(videoBase64, 'base64');
        const caption = formatCaption(metadata);

        await bot.sendVideo(chatId, videoBuffer, {
            caption: caption,
            parse_mode: 'Markdown'
        });

    } catch (error) {
        let errorMessage = 'Произошла ошибка. Не удалось скачать видео. 😞';
        if (error.message === 'API did not return video data.') {
            errorMessage = 'Ошибка на сервере: не удалось получить файл видео. Попробуйте позже.';
        } else if (error.response) {
            errorMessage = 'Сервер обработки видео вернул ошибку. Возможно, видео недоступно.';
            console.error(`[${new Date().toLocaleString()}] Ошибка от API:`, error.response.data);
        } else {
            console.error(`[${new Date().toLocaleString()}] Ошибка при обработке ${tiktokUrl}:`, error.message);
        }
        
        await bot.sendMessage(chatId, errorMessage, {
             reply_to_message_id: msg.message_id
        });
    } finally {
        if (processingMessage) {
            await bot.deleteMessage(chatId, processingMessage.message_id);
        }
    }
});

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function formatCaption(metadata) {
    const { author, description, music, statistics, region, shazam, video_details } = metadata;
    const stats = statistics || {};

    const safeAuthorId = escapeMarkdown(author.uniqueId || 'Неизвестен');
    const safeDescription = escapeMarkdown(description || '');
    const safeMusicTitle = escapeMarkdown(music.title || 'Оригинальный звук');

    const authorLine = `👤 *Автор:* @${safeAuthorId}`;
    const regionLine = region ? `\n📍 *Регион:* ${getCountryName(region)}` : '';
    const descriptionLine = safeDescription ? `\n\n📝 *Описание:*\n${safeDescription}` : '';
    const musicLine = `\n\n🎵 *Музыка:* ${safeMusicTitle}`;
    
    let shazamLine = '';
    if (shazam && shazam.title) {
        const safeShazamTitle = escapeMarkdown(shazam.title);
        const safeShazamArtist = escapeMarkdown(shazam.artist);
        shazamLine = `\n🎧 *Shazam:* ${safeShazamTitle} - ${safeShazamArtist}`;
    }

    const statsLine = `\n\n*📊 Статистика:*\n` +
        `❤️ Лайки: ${formatNumber(stats.diggCount || 0)}\n` +
        `💬 Комментарии: ${formatNumber(stats.commentCount || 0)}\n` +
        `🔁 Репосты: ${formatNumber(stats.shareCount || 0)}\n` +
        `▶️ Просмотры: ${formatNumber(stats.playCount || 0)}`;

    let videoDetailsLine = '';
    if (video_details) {
        videoDetailsLine = `\n\n*⚙️ Видео:*\n` +
            `Разрешение: ${video_details.resolution}\n` +
            `FPS: ${video_details.fps}\n` +
            `Размер: ${video_details.size_mb}`;
    }

    return `${authorLine}${regionLine}${descriptionLine}${musicLine}${shazamLine}${statsLine}${videoDetailsLine}`;
}


function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return String(num);
}

function escapeMarkdown(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/([_*`\[])/g, '\\$1');
}

function getCountryName(code) {
    const countryCodes = {
        'JP': 'Япония', 'US': 'США', 'RU': 'Россия', 'KR': 'Южная Корея',
        'GB': 'Великобритания', 'DE': 'Германия', 'FR': 'Франция', 'IT': 'Италия',
        'ES': 'Испания', 'CA': 'Канада', 'AU': 'Австралия', 'BR': 'Бразилия',
        'IN': 'Индия', 'ID': 'Индонезия', 'MX': 'Мексика', 'TR': 'Турция',
        'VN': 'Вьетнам', 'TH': 'Таиланд', 'PH': 'Филиппины', 'MY': 'Малайзия',
        'UA': 'Украина', 'KZ': 'Казахстан', 'BY': 'Беларусь', 'PL': 'Польша',
        'NL': 'Нидерланды', 'SE': 'Швеция', 'CN': 'Китай'
    };
    return countryCodes[String(code).toUpperCase()] || code;
}

bot.on('polling_error', (error) => {
    console.error(`[Polling Error] ${error.code}: ${error.message}`);
});