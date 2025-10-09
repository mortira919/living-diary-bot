import { useState, useEffect } from 'react';
import axios from 'axios';
import { auth, signInWithGoogle } from './firebase'; // Импортируем нашу настройку
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [chatId, setChatId] = useState(null);
  const [status, setStatus] = useState('Ожидание входа...');

  // При загрузке страницы, получаем chatId из URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('chatId');
    if (id) {
      setChatId(id);
      setStatus('Пожалуйста, войдите в свой аккаунт, чтобы связать его с Telegram.');
    } else {
      setStatus('Ошибка: chatId не найден. Пожалуйста, вернитесь в Telegram и попробуйте снова.');
    }

    // Следим за состоянием авторизации
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        setUser(user);
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLinkAccount = async () => {
    if (!user || !chatId) return;
    setStatus('Связываем аккаунты...');
    try {
      const token = await user.getIdToken();
      
      // !!! ВОТ ЗДЕСЬ НУЖЕН ПРАВИЛЬНЫЙ URL БЭКЕНДА (порт 3001) !!!
      const backendUrl = 'https://strobilaceous-implicatively-raelene.ngrok-free.dev';

      await axios.post(`${backendUrl}/api/link-account`, 
        { chatId: chatId },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      setStatus('Успешно! Теперь вы можете закрыть это окно и вернуться в Telegram.');
    } catch (error) {
      console.error(error);
      const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
      setStatus(`Ошибка: ${errorMessage}`);
    }
  };

  if (user) {
    return (
      <div className="App">
        <h1>Аккаунт определен</h1>
        <p>Привет, {user.displayName}!</p>
        <button onClick={handleLinkAccount}>Завершить привязку к Telegram</button>
        <p>{status}</p>
      </div>
    );
  }

  return (
    <div className="App">
      <h1>Привязка Telegram-аккаунта</h1>
      <p>{status}</p>
      <button onClick={signInWithGoogle} disabled={!chatId}>
        Войти через Google
      </button>
    </div>
  );
}

export default App;