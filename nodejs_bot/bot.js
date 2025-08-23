// nodejs_bot/bot.js

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_INTERNAL_URL = 'http://127.0.0.1:18361';
const PUBLIC_SERVER_IP = '108.165.164.216';

const tokenPath = path.join(__dirname, 'token.txt');
if (!fs.existsSync(tokenPath)) {
    console.error('Ошибка: Файл token.txt не найден!');
    process.exit(1);
}
const token = fs.readFileSync(tokenPath, 'utf8').trim();
const bot = new TelegramBot(token, { polling: true });
console.log('Бот запущен...');

function escapeHTML(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const countryCodes = { 'AU': 'Австралия 🇦🇺', 'AT': 'Австрия 🇦🇹', 'AZ': 'Азербайджан 🇦🇿', 'AL': 'Албания 🇦🇱', 'DZ': 'Алжир 🇩🇿', 'AE': 'ОАЭ 🇦🇪', 'AR': 'Аргентина 🇦🇷', 'AM': 'Армения 🇦🇲', 'BD': 'Бангладеш 🇧🇩', 'BY': 'Беларусь 🇧🇾', 'BE': 'Бельгия 🇧🇪', 'BG': 'Болгария 🇧🇬', 'BR': 'Бразилия 🇧🇷', 'GB': 'Великобритания 🇬🇧', 'HU': 'Венгрия 🇭🇺', 'VE': 'Венесуэла 🇻🇪', 'VN': 'Вьетнам 🇻🇳', 'DE': 'Германия 🇩🇪', 'GR': 'Греция 🇬🇷', 'GE': 'Грузия 🇬🇪', 'DK': 'Дания 🇩🇰', 'EG': 'Египет 🇪🇬', 'IL': 'Израиль 🇮🇱', 'IN': 'Индия 🇮🇳', 'ID': 'Индонезия 🇮🇩', 'IQ': 'Ирак 🇮🇶', 'IR': 'Иран 🇮🇷', 'IE': 'Ирландия 🇮🇪', 'ES': 'Испания 🇪🇸', 'IT': 'Италия 🇮🇹', 'KZ': 'Казахстан 🇰🇿', 'KH': 'Камбоджа 🇰🇭', 'CA': 'Канада 🇨🇦', 'QA': 'Катар 🇶🇦', 'CY': 'Кипр 🇨🇾', 'KG': 'Киргизия 🇰🇬', 'CN': 'Китай 🇨🇳', 'CO': 'Колумбия 🇨🇴', 'KW': 'Кувейт 🇰🇼', 'LV': 'Латвия 🇱🇻', 'LB': 'Ливан 🇱🇧', 'LT': 'Литва 🇱🇹', 'MY': 'Малайзия 🇲🇾', 'MA': 'Марокко 🇲🇦', 'MX': 'Мексика 🇲🇽', 'MD': 'Молдова 🇲🇩', 'MN': 'Монголия 🇲🇳', 'MM': 'Мьянма 🇲🇲', 'NP': 'Непал 🇳🇵', 'NL': 'Нидерланды 🇳🇱', 'NZ': 'Новая Зеландия 🇳🇿', 'NO': 'Норвегия 🇳🇴', 'OM': 'Оман 🇴🇲', 'PK': 'Пакистан 🇵🇰', 'PE': 'Перу 🇵🇪', 'PL': 'Польша 🇵🇱', 'PT': 'Португалия 🇵🇹', 'PR': 'Пуэрто-Рико 🇵🇷', 'KR': 'Южная Корея 🇰🇷', 'RU': 'Россия 🇷🇺', 'RO': 'Румыния 🇷🇴', 'SA': 'Саудовская Аравия 🇸🇦', 'RS': 'Сербия 🇷🇸', 'SG': 'Сингапур 🇸🇬', 'SK': 'Словакия 🇸🇰', 'SI': 'Словения 🇸🇮', 'US': 'США 🇺🇸', 'TH': 'Таиланд 🇹🇭', 'TW': 'Тайвань 🇹🇼', 'TR': 'Турция 🇹🇷', 'UZ': 'Узбекистан 🇺🇿', 'UA': 'Украина 🇺🇦', 'UY': 'Уругвай 🇺🇾', 'PH': 'Филиппины 🇵🇭', 'FI': 'Финляндия 🇫🇮', 'FR': 'Франция 🇫🇷', 'HR': 'Хорватия 🇭🇷', 'CZ': 'Чехия 🇨🇿', 'CL': 'Чили 🇨🇱', 'CH': 'Швейцария 🇨🇭', 'SE': 'Швеция 🇸🇪', 'LK': 'Шри-Ланка 🇱🇰', 'EC': 'Эквадор 🇪🇨', 'EE': 'Эстония 🇪🇪', 'ZA': 'ЮАР 🇿🇦', 'JP': 'Япония 🇯🇵'};
function getCountryName(code) { if (!code) return 'Не указан'; return countryCodes[code.toUpperCase()] || code.toUpperCase(); }
function formatNumber(num) { if (typeof num !== 'number') return 0; return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,'); }
const formatTimestamp = (unixTime) => new Date(unixTime * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

bot.on('message', async (msg) => {
    if (!msg.text) return;
    const chatId = msg.chat.id;
    const text = msg.text;
    const tiktokRegex = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/\S+/;
    const match = text.match(tiktokRegex);

    if (match) {
        const tiktokUrl = match[0];
        const waitingMsg = await bot.sendMessage(chatId, '⏳ Получил ссылку, запрашиваю данные...', { reply_to_message_id: msg.message_id });

        try {
            const response = await axios.get(`${API_INTERNAL_URL}/video_data`, { params: { original_url: tiktokUrl }, timeout: 180000 });
            const { metadata, videoBase64, videoFilePath, image_paths } = response.data;
            
            if (image_paths && image_paths.length > 0) {
                await bot.editMessageText(`✅ Данные получены. Скачиваю ${image_paths.length} фото...`, { chat_id: chatId, message_id: waitingMsg.message_id });
                let rawDesc = metadata.desc || '';
                const header = `<b>Автор:</b> @${escapeHTML(metadata.author?.uniqueId || '')}\n`;
                const stats = metadata.stats || {};
                const music = metadata.music || {};
                const footer = `❤️ ${formatNumber(stats.diggCount)} | 💬 ${formatNumber(stats.commentCount)} | ⭐ ${formatNumber(stats.collectCount)} | 🔁 ${formatNumber(stats.shareCount)}\n\n`
                             + `🎵 <b>Музыка:</b> ${music.title ? `${escapeHTML(music.title)} - ${escapeHTML(music.authorName)}` : '<i>Оригинальный звук</i>'}`;
                
                const MAX_CAPTION_LENGTH = 1024;
                const availableLength = MAX_CAPTION_LENGTH - (header.length + footer.length) - 100;
                if (rawDesc.length > availableLength) rawDesc = rawDesc.substring(0, availableLength) + '...';
                const descriptionBlock = rawDesc ? `<b>Описание:</b>\n<blockquote expandable>${escapeHTML(rawDesc)}</blockquote>\n\n` : '';
                
                let finalCaption = `${header}${descriptionBlock}${footer}`.trim();
                if (finalCaption.length > MAX_CAPTION_LENGTH) finalCaption = finalCaption.substring(0, MAX_CAPTION_LENGTH - 3) + '...';

                const mediaGroupPromises = image_paths.map(async (relative_url) => {
                    const fullUrl = `${API_INTERNAL_URL}${relative_url}`;
                    const imageResponse = await axios.get(fullUrl, { responseType: 'arraybuffer' });
                    return { type: 'photo', media: imageResponse.data };
                });
                const mediaGroup = await Promise.all(mediaGroupPromises);
                
                if (mediaGroup.length > 0) {
                    mediaGroup[0].caption = finalCaption;
                    mediaGroup[0].parse_mode = 'HTML';
                }
                
                await bot.editMessageText('✅ Фото скачаны. Отправляю альбом...', { chat_id: chatId, message_id: waitingMsg.message_id });
                for (let i = 0; i < mediaGroup.length; i += 10) {
                    await bot.sendMediaGroup(chatId, mediaGroup.slice(i, i + 10), { reply_to_message_id: msg.message_id });
                }
                await bot.deleteMessage(chatId, waitingMsg.message_id);

            } else {
                await bot.deleteMessage(chatId, waitingMsg.message_id);
                let sentVideoMsg;
                await bot.sendChatAction(chatId, 'upload_video');
                if (videoFilePath) sentVideoMsg = await bot.sendVideo(chatId, videoFilePath, { caption: '​', reply_to_message_id: msg.message_id });
                else if (videoBase64) sentVideoMsg = await bot.sendVideo(chatId, Buffer.from(videoBase64, 'base64'), { caption: '​', reply_to_message_id: msg.message_id });
                else throw new Error("API не вернул ни видео, ни фотоальбом.");
                
                let desc = metadata.desc || '<i>Без описания</i>';
                const stats = metadata.stats || {};
                const authorStats = metadata.authorStats || {};
                const videoDetails = metadata.videoDetails || {};

                const header = `<b>Автор:</b> @${escapeHTML(metadata.author?.uniqueId || '')}\n` + (authorStats ? `  👥 Подписчиков: ${formatNumber(authorStats.followerCount)}\n  ❤️ Всего лайков: ${formatNumber(authorStats.heartCount)}\n\n` : '\n');
                const statsBlock = `<b>Статистика видео:</b>\n` + `  ❤️ Лайки: ${formatNumber(stats.diggCount)}\n` + `  💬 Комментарии: ${formatNumber(stats.commentCount)}\n` + `  🔁 Репосты: ${formatNumber(stats.shareCount)}\n` + `  ▶️ Просмотры: ${formatNumber(stats.playCount)}\n\n`;
                const detailsBlock = `<b>Детали:</b>\n` + `  🌑 <b>Теневой бан:</b> ${metadata.warnInfo ? 'Да ⚠️' : 'Нет ✅'}\n` + `  📍 <b>Регион:</b> ${getCountryName(metadata.locationCreated)}\n` + `  📅 Опубликовано: ${escapeHTML(formatTimestamp(metadata.createTime))}\n` + (metadata.video?.duration ? `  ⏱️ Длительность: ${metadata.video.duration} сек\n` : '') + (videoDetails.resolution ? `  ⚙️ Разрешение: ${videoDetails.resolution}\n` : '') + (videoDetails.fps ? `  🎞️ Кадров/сек: ~${videoDetails.fps}\n` : '') + (videoDetails.size_mb ? `  💾 Размер: ${escapeHTML(videoDetails.size_mb)}` : '');
                let musicLine = `\n\n🎵 <b>Музыка:</b> <i>Оригинальный звук</i>`;
                if (metadata.shazam?.title && metadata.shazam?.title !== 'Неизвестно') musicLine = `\n\n🎵 <b>Shazam:</b> ${escapeHTML(metadata.shazam.artist)} - ${escapeHTML(metadata.shazam.title)}`;
                
                const staticLength = (header + statsBlock + detailsBlock + musicLine).length;
                const availableLength = 1024 - staticLength - 100;
                if (desc.length > availableLength) desc = desc.substring(0, availableLength) + '...';
                const descriptionBlock = `<b>Описание:</b>\n<blockquote expandable>${escapeHTML(desc)}</blockquote>\n\n`;
                
                let finalCaption = `${header}${descriptionBlock}${statsBlock}${detailsBlock}`.trim() + musicLine;
                if (finalCaption.length > 1024) finalCaption = finalCaption.substring(0, 1021) + '...';

                if (finalCaption.trim().length > 1) {
                    const options = { chat_id: chatId, message_id: sentVideoMsg.message_id, parse_mode: 'HTML' };
                    if (metadata.music_file_id && metadata.id) {
                        const musicDownloadUrl = `http://${PUBLIC_SERVER_IP}:18361/download/${metadata.id}/${metadata.music_file_id}`;
                        options.reply_markup = JSON.stringify({
                            inline_keyboard: [[{ text: '🎵 Скачать распознанный трек', url: musicDownloadUrl }]]
                        });
                    }
                    await bot.editMessageCaption(finalCaption.trim(), options);
                }
            }
        } catch (error) {
            const errorBody = error.response?.data || error.message || 'Неизвестная ошибка';
            console.error(`[${chatId}] ГЛОБАЛЬНАЯ ОШИБКА:`, errorBody);
            const errorText = (typeof errorBody === 'object' && errorBody.detail) ? `Ошибка: ${errorBody.detail}` : 'Произошла критическая ошибка. Попробуйте позже.';
            try { await bot.editMessageText(errorText, { chat_id: chatId, message_id: waitingMsg.message_id }); }
            catch (editError) { console.error(`[${chatId}] Не удалось отредактировать сообщение об ошибке:`, editError.message); }
        }
    }
});

bot.on('polling_error', (error) => console.error('Ошибка опроса:', error.code, '-', error.message));