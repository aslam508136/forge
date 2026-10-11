import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminPage from './components/AdminPage';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

const isAdminRoute = window.location.pathname.startsWith('/admin');

if (window.location.hash.includes('type=recovery') && window.location.origin !== 'https://ajayaws.web.app') {
  window.location.replace('https://ajayaws.web.app/' + window.location.hash);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {isAdminRoute ? <AdminPage /> : <App />}
    </ThemeProvider>
  </React.StrictMode>
);
