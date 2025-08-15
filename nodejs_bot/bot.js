const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const SERVER_IP = '108.165.164.216'; // Укажите ваш публичный IP, если нужно
const tokenPath = path.join(__dirname, 'token.txt');
if (!fs.existsSync(tokenPath)) { console.error('Ошибка: Файл token.txt не найден!'); process.exit(1); }
const token = fs.readFileSync(tokenPath, 'utf8').trim();
const API_URL = 'http://127.0.0.1:18361';

const bot = new TelegramBot(token, { polling: true });
console.log('Бот запущен...');

// +++ РАСШИРЕННЫЙ СПИСОК СТРАН +++
const countryCodes = {
    'AU': 'Австралия 🇦🇺', 'AT': 'Австрия 🇦🇹', 'AZ': 'Азербайджан 🇦🇿',
    'AL': 'Албания 🇦🇱', 'DZ': 'Алжир 🇩🇿', 'AE': 'ОАЭ 🇦🇪',
    'AR': 'Аргентина 🇦🇷', 'AM': 'Армения 🇦🇲', 'BD': 'Бангладеш 🇧🇩',
    'BY': 'Беларусь 🇧🇾', 'BE': 'Бельгия 🇧🇪', 'BG': 'Болгария 🇧🇬',
    'BR': 'Бразилия 🇧🇷', 'GB': 'Великобритания 🇬🇧', 'HU': 'Венгрия 🇭🇺',
    'VE': 'Венесуэла 🇻🇪', 'VN': 'Вьетнам 🇻🇳', 'DE': 'Германия 🇩🇪',
    'GR': 'Греция 🇬🇷', 'GE': 'Грузия 🇬🇪', 'DK': 'Дания 🇩🇰',
    'EG': 'Египет 🇪🇬', 'IL': 'Израиль 🇮🇱', 'IN': 'Индия 🇮🇳',
    'ID': 'Индонезия 🇮🇩', 'IQ': 'Ирак 🇮🇶', 'IR': 'Иран 🇮🇷',
    'IE': 'Ирландия 🇮🇪', 'ES': 'Испания 🇪🇸', 'IT': 'Италия 🇮🇹',
    'KZ': 'Казахстан 🇰🇿', 'KH': 'Камбоджа 🇰🇭', 'CA': 'Канада 🇨🇦',
    'QA': 'Катар 🇶🇦', 'CY': 'Кипр 🇨🇾', 'KG': 'Киргизия 🇰🇬',
    'CN': 'Китай 🇨🇳', 'CO': 'Колумбия 🇨🇴', 'KW': 'Кувейт 🇰🇼',
    'LV': 'Латвия 🇱🇻', 'LB': 'Ливан 🇱🇧', 'LT': 'Литва 🇱🇹',
    'MY': 'Малайзия 🇲🇾', 'MA': 'Марокко 🇲🇦', 'MX': 'Мексика 🇲🇽',
    'MD': 'Молдова 🇲🇩', 'MN': 'Монголия 🇲🇳', 'MM': 'Мьянма 🇲🇲',
    'NP': 'Непал 🇳🇵', 'NL': 'Нидерланды 🇳🇱', 'NZ': 'Новая Зеландия 🇳🇿',
    'NO': 'Норвегия 🇳🇴', 'OM': 'Оман 🇴🇲', 'PK': 'Пакистан 🇵🇰',
    'PE': 'Перу 🇵🇪', 'PL': 'Польша 🇵🇱', 'PT': 'Португалия 🇵🇹',
    'PR': 'Пуэрто-Рико 🇵🇷', 'KR': 'Южная Корея 🇰🇷', 'RU': 'Россия 🇷🇺',
    'RO': 'Румыния 🇷🇴', 'SA': 'Саудовская Аравия 🇸🇦', 'RS': 'Сербия 🇷🇸',
    'SG': 'Сингапур 🇸🇬', 'SK': 'Словакия 🇸🇰', 'SI': 'Словения 🇸🇮',
    'US': 'США 🇺🇸', 'TH': 'Таиланд 🇹🇭', 'TW': 'Тайвань 🇹🇼',
    'TR': 'Турция 🇹🇷', 'UZ': 'Узбекистан 🇺🇿', 'UA': 'Украина 🇺🇦',
    'UY': 'Уругвай 🇺🇾', 'PH': 'Филиппины 🇵🇭', 'FI': 'Финляндия 🇫🇮',
    'FR': 'Франция 🇫🇷', 'HR': 'Хорватия 🇭🇷', 'CZ': 'Чехия 🇨🇿',
    'CL': 'Чили 🇨🇱', 'CH': 'Швейцария 🇨🇭', 'SE': 'Швеция 🇸🇪',
    'LK': 'Шри-Ланка 🇱🇰', 'EC': 'Эквадор 🇪🇨', 'EE': 'Эстония 🇪🇪',
    'ZA': 'ЮАР 🇿🇦', 'JP': 'Япония 🇯🇵'
};

function getCountryName(code) {
    if (!code) return 'Не указан';
    const upperCode = code.toUpperCase();
    return countryCodes[upperCode] || upperCode;
}

function formatNumber(num) {
    if (typeof num !== 'number') return 0;
    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1 ');
}

function formatTimestamp(unixTimestamp) {
    const d = new Date(unixTimestamp * 1000);
    return d.toLocaleString('ru-RU', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'Europe/Moscow'
    }).replace(',', '');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const tiktokRegex = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/\S+/;
    const match = text.match(tiktokRegex);

    if (match) {
        const tiktokUrl = match[0];
        const waitingMsg = await bot.sendMessage(chatId, '⏳ Получаю основную информацию...', { reply_to_message_id: msg.message_id });

        try {
            const response = await axios.get(`${API_URL}/video_data`, { params: { original_url: tiktokUrl }, timeout: 60000 });
            const { metadata, videoBase64 } = response.data;
            
            await bot.deleteMessage(chatId, waitingMsg.message_id);
            const videoBuffer = Buffer.from(videoBase64, 'base64');
            const sentVideoMsg = await bot.sendVideo(chatId, videoBuffer, { caption: '​' });

            const captionParts = [];
            captionParts.push(`👤 **Автор:** @${metadata.author.uniqueId}\n  👥 Подписчиков: ${formatNumber(metadata.authorStats.followerCount)}\n  ❤️ Всего лайков: ${formatNumber(metadata.authorStats.heartCount)}`);
            captionParts.push(captionParts[0] + `\n\n📝 **Описание:** ${metadata.description || 'Без описания'}`);
            captionParts.push(captionParts[1] + `\n\n**Статистика видео:**\n  ❤️ Лайки: ${formatNumber(metadata.statistics.diggCount)}\n  💬 Комментарии: ${formatNumber(metadata.statistics.commentCount)}\n  🔁 Репосты: ${formatNumber(metadata.statistics.shareCount)}\n  ▶️ Просмотры: ${formatNumber(metadata.statistics.playCount)}`);
            const detailsPart = `\n\n**Детали:**\n  🌑 **Теневой бан:** ${metadata.shadow_ban ? 'Да ⚠️' : 'Нет ✅'}\n  📍 **Регион:** ${getCountryName(metadata.region)}\n  📅 Опубликовано: ${formatTimestamp(metadata.createTime)}\n  ⏱️ Длительность: ${metadata.video_duration} сек.\n  ⚙️ Разрешение: ${metadata.video_details.resolution}`;
            captionParts.push(captionParts[2] + detailsPart);
            
            let finalCaption = captionParts[3];
            let musicLine = `\n\n🎵 **Музыка:** Оригинальный звук`;
            if (metadata.shazam && metadata.shazam.title !== 'Неизвестно') {
                musicLine = `\n\n🎵 **Shazam:** ${metadata.shazam.artist} - ${metadata.shazam.title}`;
                if (metadata.music_task_id) {
                    musicLine += ` (Ищем музыку...)`;
                }
            }
            captionParts.push(finalCaption + musicLine);
            
            for (const caption of captionParts) {
                await bot.editMessageCaption(caption, { chat_id: chatId, message_id: sentVideoMsg.message_id, parse_mode: 'Markdown' });
                await sleep(700);
            }
            finalCaption += musicLine;

            if (metadata.music_task_id) {
                try {
                    const musicResponse = await axios.get(`${API_URL}/music_status/${metadata.music_task_id}`, { timeout: 120000 });
                    const { status, result } = musicResponse.data;

                    if (status === 'completed') {
                        const musicDownloadUrl = `http://${SERVER_IP}:18361/download/${result}`;
                        const newMusicLine = `\n\n🎵 **Shazam:** [${metadata.shazam.artist} - ${metadata.shazam.title}](${musicDownloadUrl})`;
                        finalCaption = finalCaption.replace(musicLine.trim(), newMusicLine.trim());
                    } else {
                        finalCaption = finalCaption.replace('(Ищем музыку...)', '(не найдена)');
                    }
                } catch (musicError) {
                    console.error("Ошибка при получении музыки:", musicError.message);
                    finalCaption = finalCaption.replace('(Ищем музыку...)', '(ошибка поиска)');
                }
                await bot.editMessageCaption(finalCaption, { chat_id: chatId, message_id: sentVideoMsg.message_id, parse_mode: 'Markdown' });
            }

        } catch (error) {
            const errorText = error.response?.data?.detail ? `Ошибка: ${error.response.data.detail}` : 'Произошла критическая ошибка.';
            await bot.editMessageText(errorText, { chat_id: chatId, message_id: waitingMsg.message_id });
        }
    }
});