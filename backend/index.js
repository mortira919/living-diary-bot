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

const prisma = new PrismaClient();
const bot = new TelegramBot(token, { polling: true });

console.log("Бот запущен");

bot.on('message', async (msg) => {
  if (!msg.text) return;
  
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith('/')) {
    const command = text.split(' ')[0];

    switch (command) {
      case '/start':
        const welcomeText = "Добро пожаловать! Используйте /connect для привязки аккаунта, /notes для просмотра, /delete для удаления. Любое другое сообщение будет сохранено как заметка.";
        bot.sendMessage(chatId, welcomeText);
        break;

      case '/connect':
        const userExists = await prisma.user.findUnique({ where: { telegramChatId: String(chatId) } });
        if (userExists) {
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
        handleGetNotes(chatId);
        break;

      case '/delete':
        handleDeleteNote(chatId);
        break;
        
      default:
        bot.sendMessage(chatId, "Неизвестная команда. Используйте /help для списка команд.");
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

  try {
    await axios.post(
      `${fastApiBaseUrl}/notes/bot/`, // <--- ИЗМЕНЕНО
      {
        text: text,
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
    const response = await axios.get(
      `${fastApiBaseUrl}/notes/bot/`, // <--- ИЗМЕНЕНО
      {
        params: { userId: firebaseUid },
        headers: { 'X-Internal-Secret': internalSecretKey }
      }
    );
    const notes = response.data;

    if (!notes || notes.length === 0) {
      return bot.sendMessage(chatId, "У вас пока нет ни одной заметки в дневнике.");
    }
    const responseText = notes.map((note, index) => `${index + 1}. ${note.text}`).join('\n');
    bot.sendMessage(chatId, `Ваши последние заметки:\n${responseText}`);

  } catch (error) {
    console.error('Ошибка при запросе к FastAPI для /notes:', error.response ? error.response.data : error.message);
    bot.sendMessage(chatId, '❌ Не удалось получить доступ к вашему дневнику. Попробуйте позже.');
  }
}

async function handleDeleteNote(chatId) {
    const firebaseUid = await getFirebaseUid(chatId);
    if (!firebaseUid) return;

    try {
        const response = await axios.get(`${fastApiBaseUrl}/notes/bot/`, { // <--- ИЗМЕНЕНО
            params: { userId: firebaseUid, limit: 5 },
            headers: { 'X-Internal-Secret': internalSecretKey }
        });
        const notes = response.data;

        if (notes.length === 0) {
            return bot.sendMessage(chatId, "Вам пока нечего удалять.");
        }
        const keyboard = notes.map(note => ([
            { text: `❌ ${note.text.substring(0, 30)}...`, callback_data: `delete_${note.id}` }
        ]));

        bot.sendMessage(chatId, 'Какую заметку вы хотите удалить?', {
            reply_markup: { inline_keyboard: keyboard }
        });
    } catch (error) {
        console.error('Ошибка при получении заметок для удаления:', error.response ? error.response.data : error.message);
        bot.sendMessage(chatId, '❌ Не удалось получить список заметок для удаления.');
    }
}

bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  const chatId = msg.chat.id;

  if (data.startsWith('delete_')) {
    const firebaseUid = await getFirebaseUid(chatId);
    if (!firebaseUid) return;

    const noteIdToDelete = data.split('_')[1];
    
    try {
      await axios.delete(
        `${fastApiBaseUrl}/notes/bot/${noteIdToDelete}`, // <--- ИЗМЕНЕНО
        {
          headers: { 'X-Internal-Secret': internalSecretKey },
          params: { userId: firebaseUid }
        }
      );
      
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Заметка удалена!' });
      bot.editMessageText('Заметка успешно удалена.', {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        reply_markup: { inline_keyboard: [] }
      });
    } catch (error) {
      console.error("Ошибка при удалении заметки через FastAPI:", error.response ? error.response.data : error.message);
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка при удалении!' });
    }
  }
});

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

    bot.sendMessage(chatId, '🎉 Отлично! Ваш аккаунт успешно связан. Теперь вы можете сохранять заметки прямо здесь.');
    
    res.status(200).json({ message: 'Аккаунт успешно связан!' });
  } catch (error) {
    console.error("Ошибка при связывании аккаунта:", error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});