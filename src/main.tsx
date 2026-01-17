import 'reflect-metadata';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './index.css';
import 'katex/dist/katex.min.css';
import App from './App';

import { GoogleOAuthProvider } from '@react-oauth/google';
import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './utils/msalConfig';
import { SENTRY_DSN } from './config';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!import.meta.env.DEV) {
    Sentry.init({
        dsn: SENTRY_DSN,
        integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
        // Tracing
        tracesSampleRate: 1.0, //  Capture 100% of the transactions
        // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
        tracePropagationTargets: ['localhost', /^https:\/\/yourserver\.io\/api/],
        // Session Replay
        replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
        sendDefaultPii: true,
    });
}

// Initialize Microsoft Clarity
const clarityId = import.meta.env.VITE_CLARITY_ID;
if (clarityId) {
    (function (c: any, l: any, a: any, r: any, i: any, t?: any, y?: any) {
        c[a] =
            c[a] ||
            function (...args: any[]) {
                (c[a].q = c[a].q || []).push(args);
            };
        t = l.createElement(r);
        t.async = 1;
        t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0];
        y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', clarityId);
}

msalInstance.initialize().then(() => {
    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <MsalProvider instance={msalInstance}>
                <GoogleOAuthProvider clientId={googleClientId}>
                    <App />
                </GoogleOAuthProvider>
            </MsalProvider>
        </StrictMode>
    );
});
