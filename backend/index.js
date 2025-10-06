require('dotenv').config();

const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { PrismaClient } = require('@prisma/client');
const admin = require('firebase-admin');


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
  const userId = String(chatId);
  if (text === '/start') {
    const welcomeText = "Добро пожаловать! Отправьте мне сообщение для сохранения, /notes для просмотра, /delete для удаления.";
    bot.sendMessage(chatId, welcomeText);
  
  } else if (text === '/notes') {
    const notes = await prisma.note.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    if (notes.length === 0) {
      return bot.sendMessage(chatId, "У вас пока нет ни одной заметки.");
    }
    const responseText = notes.map((note, index) => `${index + 1}. ${note.text}`).join('\n');
    bot.sendMessage(chatId, `Ваши последние заметки:\n${responseText}`);
  
  } else if (text === '/delete') {
    const notes = await prisma.note.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    if (notes.length === 0) {
      return bot.sendMessage(chatId, "Вам пока нечего удалять.");
    }
    const keyboard = notes.map(note => ([
      {
        text: `❌ ${note.text.substring(0, 30)}...`,
        callback_data: `delete_${note.id}`
      }
    ]));
    bot.sendMessage(chatId, 'Какую заметку вы хотите удалить?', {
      reply_markup: { inline_keyboard: keyboard }
    });

  } else {
    try {
      await prisma.note.create({
        data: { text: text, userId: userId }
      });
      bot.sendMessage(chatId, `✅ Заметка сохранена!`);
    } catch (error) {
      console.error('Ошибка при сохранении заметки ботом:', error);
      bot.sendMessage(chatId, `❌ Произошла ошибка.`);
    }
  }
});

bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data; 

  if (data.startsWith('delete_')) {
    const noteIdToDelete = parseInt(data.split('_')[1], 10);
    try {
      await prisma.note.delete({
        where: { id: noteIdToDelete }
      });
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Заметка удалена!' });
      bot.editMessageText('Заметка успешно удалена.', {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        reply_markup: { inline_keyboard: [] } 
      });
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


app.get('/api/notes', checkAuth, async (req, res) => { /* ... код ... */ });
app.post('/api/notes', checkAuth, async (req, res) => { /* ... код ... */ });
app.delete('/api/notes/:id', checkAuth, async (req, res) => { /* ... код ... */ });

app.post('/api/link-account', checkAuth, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const { chatId } = req.body;

    if (!chatId) {
      return res.status(400).json({ error: 'chatId не предоставлен.' });
    }

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

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});