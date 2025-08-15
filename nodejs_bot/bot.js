const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const PUBLIC_SERVER_IP = '129.146.118.56';
const API_INTERNAL_URL = 'http://127.0.0.1:18361';

const tokenPath = path.join(__dirname, 'token.txt');
if (!fs.existsSync(tokenPath)) {
    console.error('Ошибка: Файл token.txt не найден!');
    process.exit(1);
}
const token = fs.readFileSync(tokenPath, 'utf8').trim();
const bot = new TelegramBot(token, { polling: true });
console.log('Бот запущен...');

const countryCodes = { 'AU': 'Австралия 🇦🇺', 'AT': 'Австрия 🇦🇹', 'AZ': 'Азербайджан 🇦🇿', 'AL': 'Албания 🇦🇱', 'DZ': 'Алжир 🇩🇿', 'AE': 'ОАЭ 🇦🇪', 'AR': 'Аргентина 🇦🇷', 'AM': 'Армения 🇦🇲', 'BD': 'Бангладеш 🇧🇩', 'BY': 'Беларусь 🇧🇾', 'BE': 'Бельгия 🇧🇪', 'BG': 'Болгария 🇧🇬', 'BR': 'Бразилия 🇧🇷', 'GB': 'Великобритания 🇬🇧', 'HU': 'Венгрия 🇭🇺', 'VE': 'Венесуэла 🇻🇪', 'VN': 'Вьетнам 🇻🇳', 'DE': 'Германия 🇩🇪', 'GR': 'Греция 🇬🇷', 'GE': 'Грузия 🇬🇪', 'DK': 'Дания 🇩🇰', 'EG': 'Египет 🇪🇬', 'IL': 'Израиль 🇮🇱', 'IN': 'Индия 🇮🇳', 'ID': 'Индонезия 🇮🇩', 'IQ': 'Ирак 🇮🇶', 'IR': 'Иран 🇮🇷', 'IE': 'Ирландия 🇮🇪', 'ES': 'Испания 🇪🇸', 'IT': 'Италия 🇮🇹', 'KZ': 'Казахстан 🇰🇿', 'KH': 'Камбоджа 🇰🇭', 'CA': 'Канада 🇨🇦', 'QA': 'Катар 🇶🇦', 'CY': 'Кипр 🇨🇾', 'KG': 'Киргизия 🇰🇬', 'CN': 'Китай 🇨🇳', 'CO': 'Колумбия 🇨🇴', 'KW': 'Кувейт 🇰🇼', 'LV': 'Латвия 🇱🇻', 'LB': 'Ливан 🇱🇧', 'LT': 'Литва 🇱🇹', 'MY': 'Малайзия 🇲🇾', 'MA': 'Марокко 🇲🇦', 'MX': 'Мексика 🇲🇽', 'MD': 'Молдова 🇲🇩', 'MN': 'Монголия 🇲🇳', 'MM': 'Мьянма 🇲🇲', 'NP': 'Непал 🇳🇵', 'NL': 'Нидерланды 🇳🇱', 'NZ': 'Новая Зеландия 🇳🇿', 'NO': 'Норвегия 🇳🇴', 'OM': 'Оман 🇴🇲', 'PK': 'Пакистан 🇵🇰', 'PE': 'Перу 🇵🇪', 'PL': 'Польша 🇵🇱', 'PT': 'Португалия 🇵🇹', 'PR': 'Пуэрто-Рико 🇵🇷', 'KR': 'Южная Корея 🇰🇷', 'RU': 'Россия 🇷🇺', 'RO': 'Румыния 🇷🇴', 'SA': 'Саудовская Аравия 🇸🇦', 'RS': 'Сербия 🇷🇸', 'SG': 'Сингапур 🇸🇬', 'SK': 'Словакия 🇸🇰', 'SI': 'Словения 🇸🇮', 'US': 'США 🇺🇸', 'TH': 'Таиланд 🇹🇭', 'TW': 'Тайвань 🇹🇼', 'TR': 'Турция 🇹🇷', 'UZ': 'Узбекистан 🇺🇿', 'UA': 'Украина 🇺🇦', 'UY': 'Уругвай 🇺🇾', 'PH': 'Филиппины 🇵🇭', 'FI': 'Финляндия 🇫🇮', 'FR': 'Франция 🇫🇷', 'HR': 'Хорватия 🇭🇷', 'CZ': 'Чехия 🇨🇿', 'CL': 'Чили 🇨🇱', 'CH': 'Швейцария 🇨🇭', 'SE': 'Швеция 🇸🇪', 'LK': 'Шри-Ланка 🇱🇰', 'EC': 'Эквадор 🇪🇨', 'EE': 'Эстония 🇪🇪', 'ZA': 'ЮАР 🇿🇦', 'JP': 'Япония 🇯🇵'};
function getCountryName(code) { if (!code) return 'Не указан'; const upperCode = code.toUpperCase(); return countryCodes[upperCode] || upperCode; }
function formatNumber(num) { if (typeof num !== 'number') return 0; return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1 '); }
function formatTimestamp(unixTimestamp) { if (!unixTimestamp) return 'Неизвестно'; const d = new Date(unixTimestamp * 1000); return d.toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Moscow'}).replace(',', ''); }

function escapeMarkdownV2(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

bot.on('message', async (msg) => {
    if (!msg.text) return;
    
    const chatId = msg.chat.id;
    const text = msg.text;
    const tiktokRegex = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/\S+/;
    const match = text.match(tiktokRegex);

    if (match) {
        const tiktokUrl = match[0];
        const waitingMsg = await bot.sendMessage(chatId, '⏳ Обрабатываю ссылку...', { reply_to_message_id: msg.message_id });

        try {
            const response = await axios.get(`${API_INTERNAL_URL}/video_data`, { params: { original_url: tiktokUrl }, timeout: 90000 });
            const { metadata, videoBase64, videoFilePath } = response.data;
            
            await bot.deleteMessage(chatId, waitingMsg.message_id);
            
            let sentVideoMsg;
            if (videoFilePath) {
                sentVideoMsg = await bot.sendVideo(chatId, videoFilePath, { caption: '​' });
            } else if (videoBase64) {
                const videoBuffer = Buffer.from(videoBase64, 'base64');
                sentVideoMsg = await bot.sendVideo(chatId, videoBuffer, { caption: '​' });
            } else {
                throw new Error("API не вернул ни видео, ни путь к нему.");
            }
            
            let caption = '';
            if (metadata.author && metadata.author.uniqueId) {
                caption += `*Автор:* @${escapeMarkdownV2(metadata.author.uniqueId)}\n`;
                if (metadata.authorStats) {
                    caption += `  👥 Подписчиков: ${formatNumber(metadata.authorStats.followerCount)}\n`;
                    caption += `  ❤️ Всего лайков: ${formatNumber(metadata.authorStats.heartCount)}\n`;
                }
                caption += `\n`;
            }
            
            caption += `*Описание:* ${escapeMarkdownV2(metadata.description) || '_Без описания_'}\n\n`;
            
            if (metadata.statistics) {
                caption += `*Статистика видео:*\n`;
                caption += `  ❤️ Лайки: ${formatNumber(metadata.statistics.diggCount || metadata.statistics.likeCount)}\n`;
                caption += `  💬 Комментарии: ${formatNumber(metadata.statistics.commentCount)}\n`;
                caption += `  🔁 Репосты: ${formatNumber(metadata.statistics.shareCount)}\n`;
                caption += `  ▶️ Просмотры: ${formatNumber(metadata.statistics.playCount)}\n\n`;
            }
            
            caption += `*Детали:*\n`;
            caption += `  🌑 *Теневой бан:* ${metadata.shadow_ban ? 'Да ⚠️' : 'Нет ✅'}\n`;
            caption += `  📍 *Регион:* ${getCountryName(metadata.region)}\n`;
            caption += `  📅 Опубликовано: ${escapeMarkdownV2(formatTimestamp(metadata.createTime))}\n`;
            if (metadata.video_duration) caption += `  ⏱️ Длительность: ${metadata.video_duration} сек\n`;
            if (metadata.video_details) {
                if (metadata.video_details.resolution) caption += `  ⚙️ Разрешение: ${metadata.video_details.resolution}\n`;
                // --- ИСПРАВЛЕНИЕ ЗДЕСЬ ---
                if (metadata.video_details.fps) caption += `  🎞️ Кадров/сек: \\~${metadata.video_details.fps}\n`;
                if (metadata.video_details.size_mb) caption += `  💾 Размер: ${escapeMarkdownV2(metadata.video_details.size_mb)}`;
            }

            let musicLine = `\n\n🎵 *Музыка:* _Оригинальный звук_`;
            if (metadata.shazam && metadata.shazam.title && metadata.shazam.title !== 'Неизвестно') {
                musicLine = `\n\n🎵 *Shazam:* ${escapeMarkdownV2(metadata.shazam.artist)} \\- ${escapeMarkdownV2(metadata.shazam.title)}`;
            }
            let finalCaption = caption.trim() + musicLine;
            
            if (finalCaption && finalCaption.trim().length > 1) {
                const options = {
                    chat_id: chatId,
                    message_id: sentVideoMsg.message_id,
                    parse_mode: 'MarkdownV2' 
                };

                if (metadata.music_file_id && metadata.video_id) {
                    const musicDownloadUrl = `http://${PUBLIC_SERVER_IP}:18361/download/${metadata.video_id}/${metadata.music_file_id}`;
                    options.reply_markup = JSON.stringify({
                        inline_keyboard: [[{ text: '🎵 Скачать распознанный трек', url: musicDownloadUrl }]]
                    });
                }
                
                try {
                    await bot.editMessageCaption(finalCaption.trim(), options);
                } catch (editError) {
                    console.error("Ошибка при редактировании подписи (MarkdownV2):", editError.response ? editError.response.body : editError.message);
                }
            } else {
                 console.log("Подпись пуста, редактирование отменено.");
            }

        } catch (error) {
            console.error(`[${chatId}] Ошибка:`, error.response ? error.response.data : error.message);
            const errorText = error.response?.data?.detail ? `Ошибка: ${error.response.data.detail}` : 'Произошла критическая ошибка.';
            await bot.editMessageText(errorText, { chat_id: chatId, message_id: waitingMsg.message_id });
        }
    }
});

bot.on('polling_error', (error) => {
    console.error('Ошибка опроса (polling_error):', error.code, '-', error.message);
});