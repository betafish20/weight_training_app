import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Privacy from './Privacy';
import './styles.css';
const Page = window.location.pathname === '/privacy' ? Privacy : App;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Page /></React.StrictMode>);
