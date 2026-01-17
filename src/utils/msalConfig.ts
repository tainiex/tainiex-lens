import { Configuration, PopupRequest, PublicClientApplication } from '@azure/msal-browser';

export const msalConfig: Configuration = {
    auth: {
        clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID || '',
        authority: `https://login.microsoftonline.com/${import.meta.env.VITE_MICROSOFT_TENANT_ID || 'common'}`,
        redirectUri: window.location.origin + '/login',
    },
    cache: {
        cacheLocation: 'sessionStorage', // This configures where your cache will be stored
        storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
    },
};

export const loginRequest: PopupRequest = {
    scopes: ['User.Read', 'email', 'openid', 'profile'],
};

export const msalInstance = new PublicClientApplication(msalConfig);
