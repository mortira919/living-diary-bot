import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { getNotes, createNote, deleteNote } from '../api/diaryService';
import { useTheme } from '../context/ThemeContext';
import './DiaryPage.css';

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
      await createNote(newNoteText);
      // Запрашиваем обновленный список после создания
      const response = await getNotes();
      setNotes(response.data);
      setNewNoteText('');
    } catch (err) {
      setError("Ошибка создания заметки: " + err.message);
    }
  }; // <--- ВОТ НУЖНАЯ СКОБКА

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm("Вы уверены?")) return;
    setError(null);
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
    <div className="diary-page-container">
      <div className="diary-header">
        <h1>Ваш дневник</h1>
        <div className="header-buttons">
          <button onClick={toggleTheme}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button onClick={() => auth.signOut()}>Выйти</button>
        </div>
      </div>

      <form onSubmit={handleCreateNote} className="note-form">
        <textarea
          value={newNoteText}
          onChange={(e) => setNewNoteText(e.target.value)}
          placeholder="Что нового?"
          className="note-textarea"
        />
        <button type="submit">Добавить заметку</button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div className="notes-list">
        {notes.length === 0 ? (
          <p>У вас пока нет заметок.</p>
        ) : (
          notes.map(note => (
            <div key={note.id} className="note-card">
              <p>{note.content}</p>
              <div className="note-footer">
                <small className="note-date">
                  {new Date(note.created_at).toLocaleString('ru-RU', { timeZone })}
                </small>
                <button onClick={() => handleDeleteNote(note.id)} className="delete-button">
                  Удалить
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
} // <--- А эта скобка закрывает `function DiaryPage()`

export default DiaryPage;