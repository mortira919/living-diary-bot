import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCod-SvmzTm24iOyzvCC6nXMDuD3Ce7vIo",
  authDomain: "living-diary-32de8.firebaseapp.com",
  projectId: "living-diary-32de8",
  storageBucket: "living-diary-32de8.firebasestorage.app",
  messagingSenderId: "364333285257",
  appId: "1:364333285257:web:6adf46d34ee6203521eb58",
  measurementId: "G-NTSFLN17JD"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export const signInWithGoogle = () => {
  signInWithPopup(auth, provider)
    
};
