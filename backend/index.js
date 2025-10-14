require('dotenv').config();

const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { PrismaClient } = require('@prisma/client');
const admin = require('firebase-admin');
const axios = require('axios');

const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const token = process.env.TELEGRAM_BOT_TOKEN;
const port = process.env.PORT || 3001;
const fastApiBaseUrl = process.env.FASTAPI_BASE_URL;
const internalSecretKey = process.env.INTERNAL_SECRET_KEY;
const miniAppUrl = process.env.MINI_APP_URL;

const prisma = new PrismaClient();
const bot = new TelegramBot(token, { polling: true });

console.log("Бот запущен");

// Убираем всю сложную настройку меню, оставляем только простые команды
bot.setMyCommands([
  { command: '/start', description: '🚀 Начать работу и открыть дневник' },
  { command: '/connect', description: '🔗 Привязать аккаунт' },
  { command: '/notes', description: '📖 Открыть дневник' },
]);


bot.on('message', async (msg) => {
  if (!msg.text) return;
  
  const chatId = msg.chat.id;
  const text = msg.text;

  // --- ГЛАВНОЕ ИЗМЕНЕНИЕ: СООБЩЕНИЕ С КНОПКОЙ ---
  const sendOpenAppButton = (chatId, messageText) => {
    if (!miniAppUrl) {
      return bot.sendMessage(chatId, "Ошибка: URL для Mini App не настроен.");
    }
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📖 Открыть Дневник', web_app: { url: miniAppUrl } }]
        ]
      }
    };
    bot.sendMessage(chatId, messageText, options);
  };

  if (text.startsWith('/')) {
    const command = text.split(' ')[0];
    const user = await prisma.user.findUnique({ where: { telegramChatId: String(chatId) } });

    switch (command) {
      case '/start':
        if (user) {
          sendOpenAppButton(chatId, "Добро пожаловать обратно! Откройте ваш дневник, нажав на кнопку ниже.");
        } else {
          bot.sendMessage(chatId, "Добро пожаловать! Сначала нужно привязать ваш аккаунт. Используйте команду /connect.");
        }
        break;

      case '/connect':
        if (user) {
          bot.sendMessage(chatId, "✅ Ваш аккаунт уже связан!");
        } else {
          const frontendUrl = process.env.FRONTEND_LINKING_URL || 'https://living-diary-bot.vercel.app';
          const options = {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔗 Привязать аккаунт', web_app: { url: `${frontendUrl}/?chatId=${chatId}` } }]
              ]
            }
          };
          bot.sendMessage(chatId, "Пожалуйста, войдите в свой аккаунт, чтобы я мог работать с вашим дневником.", options);
        }
        break;
      
      case '/notes':
      case '/delete':
        if (user) {
          sendOpenAppButton(chatId, "Для просмотра и управления заметками, пожалуйста, откройте дневник, нажав на кнопку ниже.");
        } else {
          bot.sendMessage(chatId, "Сначала нужно связать аккаунт. Пожалуйста, используйте команду /connect.");
        }
        break;
        
      default:
        bot.sendMessage(chatId, "Неизвестная команда.");
        break;
    }
  } else {
    handleSaveNote(chatId, text);
  }
});

async function getFirebaseUid(chatId) {
  const user = await prisma.user.findUnique({
    where: { telegramChatId: String(chatId) }
  });
  if (!user) {
    bot.sendMessage(chatId, "Сначала нужно связать аккаунт. Пожалуйста, используйте команду /connect.");
    return null;
  }
  return user.firebaseUid;
}

async function handleSaveNote(chatId, text) {
  const firebaseUid = await getFirebaseUid(chatId);
  if (!firebaseUid) return;
  const title = text.length > 30 ? text.substring(0, 30) + '...' : text;
  const content = text;
  try {
    const url = `${fastApiBaseUrl}/notes/bot/`;
    await axios.post(
      url,
      { title: title, content: content, userId: firebaseUid },
      { headers: { 'X-Internal-Secret': internalSecretKey } }
    );
    bot.sendMessage(chatId, `✅ Заметка сохранена!`);
  } catch (error) {
    console.error('Ошибка при сохранении заметки через FastAPI:', error.response ? error.response.data : error.message);
    bot.sendMessage(chatId, `❌ Произошла ошибка при сохранении. Попробуйте позже.`);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const checkAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Не авторизован: Токен не предоставлен.');
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(403).send('Не авторизован: Неверный токен.');
  }
};

app.get('/api/notes', checkAuth, async (req, res) => {
    try {
        const firebaseUid = req.user.uid;
        const response = await axios.get(`${fastApiBaseUrl}/notes/bot/`, {
            params: { userId: firebaseUid },
            headers: { 'X-Internal-Secret': internalSecretKey }
        });
        res.json(response.data);
    } catch (error) {
        console.error("API Ошибка (GET /api/notes):", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});
app.post('/api/notes', checkAuth, async (req, res) => {
    try {
        const firebaseUid = req.user.uid;
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Текст не может быть пустым.' });
        const title = text.length > 30 ? text.substring(0, 30) + '...' : text;
        const content = text;
        const response = await axios.post(
            `${fastApiBaseUrl}/notes/bot/`,
            { title: title, content: content, userId: firebaseUid },
            { headers: { 'X-Internal-Secret': internalSecretKey } }
        );
        res.status(201).json(response.data);
    } catch (error) {
        console.error("API Ошибка (POST /api/notes):", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});
app.delete('/api/notes/:id', checkAuth, async (req, res) => {
    try {
        const firebaseUid = req.user.uid;
        const noteId = req.params.id;
        await axios.delete(`${fastApiBaseUrl}/notes/bot/${noteId}`, {
            params: { userId: firebaseUid },
            headers: { 'X-Internal-Secret': internalSecretKey }
        });
        res.status(204).send();
    } catch (error) {
        console.error("API Ошибка (DELETE /api/notes):", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});
app.post('/api/link-account', checkAuth, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId не предоставлен.' });
    await prisma.user.upsert({
      where: { firebaseUid: firebaseUid },
      update: { telegramChatId: String(chatId) },
      create: { firebaseUid: firebaseUid, telegramChatId: String(chatId) }
    });
    bot.sendMessage(chatId, '🎉 Отлично! Ваш аккаунт успешно связан. Теперь используйте /start, чтобы открыть дневник.');
    res.status(200).json({ message: 'Аккаунт успешно связан!' });
  } catch (error) {
    console.error("Ошибка при связывании аккаунта:", error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});