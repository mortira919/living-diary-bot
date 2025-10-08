import React from 'react';
import { signInWithGoogle } from '../firebase';

function LoginPage() {
  return (
    <div>
      <h1>Добро пожаловать в Living Diary!</h1>
      <p>Пожалуйста, войдите, чтобы продолжить.</p>
      <button onClick={signInWithGoogle}>Войти через Google</button>
    </div>
  );
}

export default LoginPage;