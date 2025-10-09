import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { auth } from '../firebase';

function DiaryPage() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          throw new Error("Пользователь не авторизован");
        }
        
        const token = await user.getIdToken();
        const backendUrl = 'https://living-diary-bot.onrender.com'; 

        const response = await axios.get(`${backendUrl}/api/notes`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        setNotes(response.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();
  }, []);

  if (loading) return <p>Загрузка заметок...</p>;
  if (error) return <p>Ошибка: {error}</p>;

  return (
    <div>
      <h1>Ваш дневник</h1>
      <button onClick={() => auth.signOut()}>Выйти</button>
      <div>
        {notes.length === 0 ? (
          <p>У вас пока нет заметок.</p>
        ) : (
          notes.map(note => (
            <div key={note.id} style={{ border: '1px solid #ccc', padding: '10px', margin: '10px' }}>
              <p>{note.text}</p>
              <small>{new Date(note.createdAt).toLocaleString()}</small>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default DiaryPage;