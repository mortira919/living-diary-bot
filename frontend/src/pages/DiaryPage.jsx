import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { getNotes, createNote, deleteNote } from '../api/diaryService';
import { useTheme } from '../context/ThemeContext';

function DiaryPage() {
  const [notes, setNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeZone, setTimeZone] = useState('UTC');
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        setLoading(true);
        getNotes()
          .then(response => setNotes(response.data))
          .catch(err => setError(err.message))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const handleCreateNote = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    try {
      const response = await createNote(newNoteText);
      // После создания заметки, запрашиваем обновленный список, чтобы все было синхронно
      getNotes().then(response => setNotes(response.data));
      setNewNoteText('');
    } catch (err) {
      setError("Ошибка создания заметки: " + err.message);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm("Вы уверены?")) return;
    setError(null); // Сбрасываем предыдущую ошибку
    try {
      await deleteNote(noteId);
      setNotes(notes.filter(note => note.id !== noteId));
    } catch (err) {
      setError("Ошибка удаления заметки: " + (err.response ? err.response.data.detail : err.message));
    }
  };

  if (loading) return <p>Загрузка...</p>;
  if (!auth.currentUser) return <p>Пожалуйста, <a href="/login">войдите</a>, чтобы увидеть ваш дневник.</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Ваш дневник</h1>
        <div>
          <button onClick={toggleTheme} style={{ marginRight: '10px' }}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button onClick={() => auth.signOut()}>Выйти</button>
        </div>
      </div>

      <form onSubmit={handleCreateNote} style={{ margin: '20px 0' }}>
        <textarea
          value={newNoteText}
          onChange={(e) => setNewNoteText(e.target.value)}
          placeholder="Что нового?"
          rows="4"
          style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
        />
        <button type="submit">Добавить заметку</button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div>
        {notes.length === 0 ? (
          <p>У вас пока нет заметок.</p>
        ) : (
          notes.map(note => (
            <div key={note.id} style={{ border: '1px solid #ccc', padding: '10px', margin: '10px 0', textAlign: 'left' }}>
              <p>{note.content}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <small>
                  {new Date(note.created_at).toLocaleString('ru-RU', { timeZone })}
                </small>
                <button onClick={() => handleDeleteNote(note.id)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Удалить
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default DiaryPage;