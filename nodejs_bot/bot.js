const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const axios = require('axios');

let token;
try {
    token = fs.readFileSync('token.txt', 'utf-8').trim();
} catch (error) {
    console.error('Ошибка! Не удалось прочитать файл token.txt.');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
console.log('Node.js бот успешно запущен...');

const PYTHON_API_URL = "http://127.0.0.1:18361/video_data";

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Привет! 👋\n\nОтправь мне ссылку на видео из TikTok, и я скачаю его и пришлю подробную информацию.');
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;

    if (!messageText || messageText.startsWith('/start')) return;

    const urlRegex = /(https?:\/\/(?:www\.)?(?:vm|vt)\.tiktok\.com\/[\w.-]+)|(https?:\/\/(?:www\.)?tiktok\.com\/[@\w.-]+\/video\/\d+)/;
    const urlMatch = messageText.match(urlRegex);

    if (urlMatch && urlMatch[0]) {
        const tiktokUrl = urlMatch[0];
        let processingMessage;

        try {
            processingMessage = await bot.sendMessage(chatId, 'Отправил запрос в API. Ожидаю ответа... ⏳', { reply_to_message_id: msg.message_id });
            
            // ИЗМЕНЕНО: Увеличен тайм-аут до 2 минут на всякий случай
            const apiResponse = await axios.get(PYTHON_API_URL, {
                params: { url: tiktokUrl },
                timeout: 120000 
            });
            const responseData = apiResponse.data;
            
            await bot.editMessageText('✅ Видео получено. Отправляю в Telegram...', { chat_id: chatId, message_id: processingMessage.message_id });
            
            const videoData = responseData.metadata;
            const videoBuffer = Buffer.from(responseData.video_base64, 'base64');
            
            const videoSizeInMb = `${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB`;
            const stats = videoData.statistics;

            const caption = `👤 Автор: ${videoData.author.nickname || 'неизвестен'} (@${videoData.author.unique_id || 'неизвестен'})
📝 Описание: ${videoData.description || 'Нет описания'}
🎵 Музыка: ${videoData.music.title || 'Оригинальный звук'} - ${videoData.music.author || ''}

📈 Статистика:
   - ❤️ Лайки: ${(stats.diggCount || 0).toLocaleString('ru-RU')}
   - ▶️ Просмотры: ${(stats.playCount || 0).toLocaleString('ru-RU')}
   - 💬 Комментарии: ${(stats.commentCount || 0).toLocaleString('ru-RU')}
   - 🔁 Поделились: ${(stats.shareCount || 0).toLocaleString('ru-RU')}
            
💾 Размер видео: ${videoSizeInMb}`;
            
            await bot.sendVideo(chatId, videoBuffer, { caption }, { filename: 'video.mp4', contentType: 'video/mp4' });
            await bot.deleteMessage(chatId, processingMessage.message_id);

        } catch (error) {
            console.error('Ошибка обработки:', error.message);
            const errorMessage = `❌ Ошибка!\n\nНе удалось обработать ссылку. Возможно, видео приватное, удалено или API TikTok временно недоступен.`;
            if (processingMessage) {
                await bot.editMessageText(errorMessage, { chat_id: chatId, message_id: processingMessage.message_id });
            } else {
                await bot.sendMessage(chatId, errorMessage);
            }
        }
    }
});