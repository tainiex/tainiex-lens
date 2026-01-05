# Security Guidelines

## Backend Configuration Required

### HttpOnly Cookie Setup
The backend must set HttpOnly cookies in the following responses:

1. `POST /api/auth/google` (or wherever login happens)
2. `POST /api/auth/google/signup`
3. `POST /api/auth/refresh`

Example (Express.js):
```javascript
res.cookie('auth_token', token, {
  httpOnly: true,        // Prevents JavaScript access (XSS protection)
  secure: true,          // Only sent over HTTPS
  sameSite: 'strict',    // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
});
```

### CORS Configuration
CORS must be configured to allow credentials from the frontend origin.

```javascript
app.use(cors({
  origin: 'https://your-domain.com',
  credentials: true  // Required for cross-origin cookies
}));
```

### Environment Variables
Ensure production environments have appropriate security flags:
```
NODE_ENV=production
COOKIE_SECURE=true
COOKIE_SAME_SITE=strict
```

### Logout Implementation
The logout endpoint should clear the auth cookie:
```javascript
res.clearCookie('auth_token');
res.status(200).send({ message: 'Logged out' });
```

## Frontend Implementation Details

- **No localStorage**: Tokens are never stored in `localStorage` or `sessionStorage`.
- **Automatic Auth**: Every request made via `apiClient` automatically includes cookies using `credentials: 'include'`.
- **Token Refresh**: Handled automatically by `apiClient` when a 401 response is received. It calls `/api/auth/refresh`, which should return a new HttpOnly cookie.
- **XSS Mitigation**: By using HttpOnly cookies, we significantly reduce the risk of token theft via XSS.
