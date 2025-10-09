import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from './App.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DiaryPage from './pages/DiaryPage.jsx';
import './index.css';


const router = createBrowserRouter([
  {
    path: "/",
    element: <App />, 
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/diary",
    element: <DiaryPage />,
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);