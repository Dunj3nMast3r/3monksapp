import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerSW } from './serviceWorkerRegistration';
import { publicService } from './services/dataService';
import { setBusinessDayStartHour } from './utils/helpers';

const root = ReactDOM.createRoot(document.getElementById('root'));
const render = () => root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

// Load the server's business-day start hour before the first screen, so every
// "today" and date filter matches the reports. Never wait more than 3 seconds:
// offline or slow, the app starts with the default (3 AM).
Promise.race([
    publicService.getBusinessDay().then(res => setBusinessDayStartHour(res.data?.data?.startHour)),
    new Promise(resolve => setTimeout(resolve, 3000)),
]).catch(() => { /* keep the default */ }).finally(render);

// Register service worker for PWA support
registerSW();
