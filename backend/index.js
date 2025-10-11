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

const prisma = new PrismaClient();
const bot = new TelegramBot(token, { polling: true });

console.log("Бот запущен");

bot.on('message', async (msg) => {
  if (!msg.text) return;
  
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '/start') {
    const welcomeText = "Добро пожаловать! Используйте /connect для привязки аккаунта, /notes для просмотра, /delete для удаления. Любое другое сообщение будет сохранено как заметка.";
    bot.sendMessage(chatId, welcomeText);
  
  } else if (text === '/connect') {
    const user = await prisma.user.findUnique({ where: { telegramChatId: String(chatId) } });

    if (user) {
      bot.sendMessage(chatId, "✅ Ваш аккаунт уже связан!");
    } else {
      const frontendUrl = 'https://living-diary-bot.vercel.app';
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
  } else {
    const user = await prisma.user.findUnique({
      where: { telegramChatId: String(chatId) }
    });

    if (!user) {
      return bot.sendMessage(chatId, "Сначала нужно связать аккаунт. Пожалуйста, используйте команду /connect.");
    }

    const userId = user.firebaseUid;

    if (text === '/notes')  {
  try {
    const response = await axios.get(
      `${process.env.FASTAPI_BASE_URL}/api/notes`,
      {
        headers: {
          'X-Internal-Secret': process.env.INTERNAL_SECRET_KEY
        },
        params: {
          userId: userId 
        }
      }
    );
    const notes = response.data;

    if (!notes || notes.length === 0) {
      return bot.sendMessage(chatId, "У вас пока нет ни одной заметки в основном дневнике.");
    }
    const responseText = notes.map((note, index) => `${index + 1}. ${note.text}`).join('\n');
    bot.sendMessage(chatId, `Ваши последние заметки:\n${responseText}`);

  } catch (error) {
    console.error('Ошибка при запросе к FastAPI для /notes:', error.response ? error.response.data : error.message);
    bot.sendMessage(chatId, '❌ Не удалось получить доступ к вашему дневнику. Попробуйте позже.');
  }
} else if (text === '/delete') {
  const notes = await prisma.note.findMany({ where: { userId: userId }, orderBy: { createdAt: 'desc' }, take: 5 });
  if (notes.length === 0) return bot.sendMessage(chatId, "Вам пока нечего удалять.");
  const keyboard = notes.map(note => ([{ text: `❌ ${note.text.substring(0, 30)}...`, callback_data: `delete_${note.id}` }]));
  bot.sendMessage(chatId, 'Какую заметку вы хотите удалить?', { reply_markup: { inline_keyboard: keyboard } });

    } else { 
      try {
        await prisma.note.create({ data: { text: text, userId: userId } });
        bot.sendMessage(chatId, `✅ Заметка сохранена!`);
      } catch (error) {
        console.error('Ошибка при сохранении заметки ботом:', error);
        bot.sendMessage(chatId, `❌ Произошла ошибка.`);
      }
    }
  }
});

bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  if (data.startsWith('delete_')) {
    const noteIdToDelete = parseInt(data.split('_')[1], 10);
    try {
      await prisma.note.delete({ where: { id: noteIdToDelete } });
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Заметка удалена!' });
      bot.editMessageText('Заметка успешно удалена.', { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: { inline_keyboard: [] } });
    } catch (error) {
      console.error("Ошибка при удалении заметки ботом:", error);
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка при удалении!' });
    }
  }
});

const app = express();
app.use(cors());
app.use(express.json());

const checkAuth = async (req, res, next) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    return res.status(401).send('Не авторизован: Токен не предоставлен.');
  }
  const idToken = req.headers.authorization.split('Bearer ')[1];
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
    const userId = req.user.uid;
    const notes = await prisma.note.findMany({ where: { userId: userId }, orderBy: { createdAt: 'desc' } });
    res.json(notes);
  } catch (error) {
    console.error("Ошибка API при получении заметок:", error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.post('/api/notes', checkAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Текст не может быть пустым.' });
    const newNote = await prisma.note.create({ data: { text: text, userId: userId } });
    res.status(201).json(newNote);
  } catch (error) {
    console.error("Ошибка API при создании заметки:", error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.delete('/api/notes/:id', checkAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const noteId = parseInt(req.params.id, 10);
    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note || note.userId !== userId) return res.status(403).json({ error: 'Доступ запрещен.' });
    await prisma.note.delete({ where: { id: noteId } });
    res.status(204).send();
  } catch (error) {
    console.error("Ошибка API при удалении заметки:", error);
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
    res.status(200).json({ message: 'Аккаунт успешно связан!' });
  } catch (error) {
    console.error("Ошибка при связывании аккаунта:", error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`Сервер запущен на порту ${process.env.PORT || 3001}`);
});