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

async function setupBotCommands() {
  await bot.setMyCommands([
    { command: '/start', description: 'Начать работу с ботом' },
    { command: '/connect', description: 'Привязать аккаунт' },
    { command: '/notes', description: 'Открыть дневник (через меню)' },
  ]);

  if (miniAppUrl) {
    await bot.setChatMenuButton({
      menuButton: {
        type: 'web_app',
        text: 'Дневник',
        web_app: { url: miniAppUrl }
      }
    });
    console.log("Кнопка меню для Mini App успешно установлена.");
  } else {
    console.warn("Внимание: MINI_APP_URL не установлена. Кнопка меню не будет настроена.");
  }
}

console.log("Бот запущен");
setupBotCommands();

bot.on('message', async (msg) => {
  if (!msg.text) return;
  
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith('/')) {
    const command = text.split(' ')[0];
    const user = await prisma.user.findUnique({ where: { telegramChatId: String(chatId) } });

    switch (command) {
      case '/start':
        const welcomeText = "Добро пожаловать! Привяжите аккаунт командой /connect, а затем откройте дневник через кнопку 'Меню' внизу.";
        bot.sendMessage(chatId, welcomeText);
        break;

      case '/connect':
        if (user) {
          bot.sendMessage(chatId, "✅ Ваш аккаунт уже связан!");
        } else {
          const frontendUrl = process.env.FRONTEND_LINKING_URL || 'https://living-diary-bot.vercel.app';
          const linkText = "Пожалуйста, войдите в свой аккаунт, чтобы я мог работать с вашим дневником.";
          const options = {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔗 Войти и связать аккаунт', web_app: { url: `${frontendUrl}/?chatId=${chatId}` } }]
              ]
            }
          };
          bot.sendMessage(chatId, linkText, options);
        }
        break;
      
      case '/notes':
      case '/delete':
        if (user) {
          bot.sendMessage(chatId, "Для просмотра и управления заметками, пожалуйста, откройте дневник через кнопку 'Меню' внизу 👇");
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
      {
        title: title,
        content: content,
        userId: firebaseUid
      },
      {
        headers: {
          'X-Internal-Secret': internalSecretKey
        }
      }
    );
    bot.sendMessage(chatId, `✅ Заметка сохранена!`);
  } catch (error) {
    console.error('Ошибка при сохранении заметки через FastAPI:', error.response ? error.response.data : error.message);
    bot.sendMessage(chatId, `❌ Произошла ошибка при сохранении. Попробуйте позже.`);
  }
}

  
async function handleGetNotes(chatId) {
    const firebaseUid = await getFirebaseUid(chatId);
    if (!firebaseUid) return;

    try {
        const response = await axios.get(`${fastApiBaseUrl}/notes/bot/`, {
            params: { userId: firebaseUid },
            headers: { 'X-Internal-Secret': internalSecretKey }
        });
        const notes = response.data;
    } catch (error) {
        console.error('Ошибка при запросе к FastAPI для /notes:', error.response ? error.response.data : error.message);
    }
}

async function handleDeleteNote(chatId) {
    const firebaseUid = await getFirebaseUid(chatId);
    if (!firebaseUid) return;

    try {
        const response = await axios.get(`${fastApiBaseUrl}/notes/bot/`, {
            params: { userId: firebaseUid, limit: 5 },
            headers: { 'X-Internal-Secret': internalSecretKey }
        });
    } catch (error) {
        console.error('Ошибка при получении заметок для удаления:', error.response ? error.response.data : error.message);
    }
}

const app = express();
app.use(cors());
app.use(express.json());

const checkAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Не авторизован: Токен не  предоставлен.');
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

    bot.sendMessage(chatId, '🎉 Отлично! Ваш аккаунт успешно связан. Теперь вы можете открывать дневник через кнопку "Меню".');
    
    res.status(200).json({ message: 'Аккаунт успешно связан!' });
  } catch (error) {
    console.error("Ошибка при связывании аккаунта:", error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});