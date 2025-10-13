import axios from 'axios';
import { auth } from '../firebase';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL || 'https://living-diary-bot.onrender.com'
});

apiClient.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export const getNotes = () => {
  return apiClient.get('/api/notes');
};

export const createNote = (text) => {
  return apiClient.post('/api/notes', { text });
};

export const deleteNote = (noteId) => {
  return apiClient.delete(`/api/notes/${noteId}`);
};