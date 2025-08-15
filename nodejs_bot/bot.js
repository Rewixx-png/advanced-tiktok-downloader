const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

// ВАЖНО: Убедитесь, что здесь указан ваш ПУБЛИЧНЫЙ IP-адрес сервера.
const PUBLIC_SERVER_IP = '108.165.164.216'; 

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
function formatTimestamp(unixTimestamp) { const d = new Date(unixTimestamp * 1000); return d.toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Moscow'}).replace(',', ''); }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // ----- ДОБАВЛЕНО ИСПРАВЛЕНИЕ -----
    // Если текста в сообщении нет, прекращаем выполнение, чтобы избежать сбоя
    if (!text) return;
    // ----------------------------------

    const tiktokRegex = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/\S+/;
    const match = text.match(tiktokRegex);

    if (match) {
        const tiktokUrl = match[0];
        const waitingMsg = await bot.sendMessage(chatId, '⏳ Обрабатываю ссылку...', { reply_to_message_id: msg.message_id });

        try {
            // ВАЖНО: В вашем коде статистика бралась из diggCount, а в API она в likeCount
            // Я вернул обратно на diggCount, как было у вас, но если статистика неверная, поменяйте на metadata.statistics.likeCount
            const response = await axios.get(`${API_INTERNAL_URL}/video_data`, { params: { original_url: tiktokUrl }, timeout: 90000 });
            const { metadata, videoBase64, videoFilePath } = response.data;
            
            await bot.deleteMessage(chatId, waitingMsg.message_id);
            
            let sentVideoMsg;
            // Сначала отправляем видео с невидимым символом в подписи, чтобы потом ее отредактировать
            if (videoFilePath) {
                console.log(`Отправка кэшированного видео из файла: ${videoFilePath}`);
                sentVideoMsg = await bot.sendVideo(chatId, videoFilePath, { caption: '​' }); // невидимый символ
            } else if (videoBase64) {
                console.log('Отправка нового видео из base64.');
                const videoBuffer = Buffer.from(videoBase64, 'base64');
                sentVideoMsg = await bot.sendVideo(chatId, videoBuffer, { caption: '​' }); // невидимый символ
            } else {
                throw new Error("API не вернул ни видео, ни путь к нему.");
            }
            
            let caption = `👤 **Автор:** @${metadata.author.uniqueId}\n` +
                        `  👥 Подписчиков: ${formatNumber(metadata.authorStats.followerCount)}\n` +
                        `  ❤️ Всего лайков: ${formatNumber(metadata.authorStats.heartCount)}\n\n` +
                        `📝 **Описание:** ${metadata.description || 'Без описания'}\n\n` +
                        `**Статистика видео:**\n` +
                        `  ❤️ Лайки: ${formatNumber(metadata.statistics.diggCount || metadata.statistics.likeCount)}\n` + // Добавил проверку на likeCount на всякий случай
                        `  💬 Комментарии: ${formatNumber(metadata.statistics.commentCount)}\n` +
                        `  🔁 Репосты: ${formatNumber(metadata.statistics.shareCount)}\n` +
                        `  ▶️ Просмотры: ${formatNumber(metadata.statistics.playCount)}\n\n` +
                        `**Детали:**\n` +
                        `  🌑 **Теневой бан:** ${metadata.shadow_ban ? 'Да ⚠️' : 'Нет ✅'}\n` +
                        `  📍 **Регион:** ${getCountryName(metadata.region)}\n` +
                        `  📅 Опубликовано: ${formatTimestamp(metadata.createTime)}\n` +
                        `  ⏱️ Длительность: ${metadata.video_duration} сек.\n` +
                        `  ⚙️ Разрешение: ${metadata.video_details.resolution}`;
            
            let musicLine = `\n\n🎵 **Музыка:** Оригинальный звук`;
            if (metadata.shazam && metadata.shazam.title !== 'Неизвестно') {
                musicLine = `\n\n🎵 **Shazam:** ${metadata.shazam.artist} - ${metadata.shazam.title}`;
            }
            
            let finalCaption = caption + musicLine;
            
            const options = {
                chat_id: chatId,
                message_id: sentVideoMsg.message_id,
                parse_mode: 'Markdown'
            };

            if (metadata.music_file_id) {
                const musicDownloadUrl = `http://${PUBLIC_SERVER_IP}:18361/download/${metadata.video_id}/${metadata.music_file_id}`;
                options.reply_markup = JSON.stringify({
                    inline_keyboard: [
                        [{ text: '🎵 Скачать распознанный трек', url: musicDownloadUrl }]
                    ]
                });
            }

            // Редактируем подпись у уже отправленного видео
            await bot.editMessageCaption(finalCaption, options);

        } catch (error) {
            console.error(`[${chatId}] Ошибка:`, error.response ? error.response.data : error.message);
            const errorText = error.response?.data?.detail ? `Ошибка: ${error.response.data.detail}` : 'Произошла критическая ошибка.';
            await bot.editMessageText(errorText, { chat_id: chatId, message_id: waitingMsg.message_id });
        }
    }
});

// Добавим обработчик ошибок, чтобы бот был стабильнее
bot.on('polling_error', (error) => {
    console.error('Ошибка опроса (polling_error):', error.code, '-', error.message);
});