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
    httpOnly: true, // Prevents JavaScript access (XSS protection)
    secure: true, // Only sent over HTTPS
    sameSite: 'strict', // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});
```

### CORS Configuration

CORS must be configured to allow credentials from the frontend origin.

```javascript
app.use(
    cors({
        origin: 'https://your-domain.com',
        credentials: true, // Required for cross-origin cookies
    })
);
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

## Mobile Security & Reanimated Safety

### Reanimated Worklet Safety (Android Crash Prevention)

When working with `react-native-reanimated` worklets (e.g., `useDerivedValue`, `useAnimatedStyle`), stricter rules apply than standard React hooks. This is critical for preventing "Trying to access property `value` of an object which cannot be sent to the UI runtime" crashes, especially on Android cold starts.

#### 1. Strict Closure Isolation

Worklets are serialized and sent to the UI thread. Any JS variable captured in the closure must be strictly serializable or a valid SharedValue.

**❌ Dangerous Pattern:**

```typescript
const { height } = useKeyboardAnimation(); // Third-party object
const insets = useSafeAreaInsets(); // JS object

// Crash Risk: 'height' or 'insets' might be complex objects not recognized by UI thread
useDerivedValue(() => {
    const safeBottom = insets.bottom; // Indirect access
    return height.value + safeBottom;
});
```

**✅ Safe Pattern (Bridge & Sanitize):**

```typescript
// 1. Bridge JS values to local SharedValues explicitly
const safeBottom = useSharedValue(insets.bottom || 0);

// 2. Use local SharedValues in worklet
useDerivedValue(() => {
    'worklet'; // Explicit directive
    // Only access .value of known local SharedValues
    return someSharedValue.value + safeBottom.value;
});
```

#### 2. Input Sanitization

Always sanitize inputs before passing them to `useSharedValue`. Undefined or Null values can cause silent failures or crashes downstream.

```typescript
// ❌ Risky
const heightSv = useSharedValue(props.height);

// ✅ Safe
const heightSv = useSharedValue(typeof props.height === 'number' ? props.height : 0);
```

#### 3. Third-Party Library Integration

Do not trust third-party hooks (like `useKeyboardAnimation`) to return "pure" SharedValues that survive closure serialization in all environments.

- **Hard Isolation Rule**: If a worklet crashes, temporarily replace its body with `return 0;`. If the crash stops, the issue is definitely one of the captured variables.
- **Bridge Strategy**: If a third-party SharedValue causes issues, create a local `useSharedValue` and sync it via `useAnimatedReaction` or `useEffect` (on JS thread), then consume the local copy in your worklet.

#### 4. Explicit Typing & Worklet Directives

- Always add `'worklet';` at the start of complex derived values to ensure Babel plugins process them correctly.
- Prefer explicit `if` statements over complex ternary operators inside worklets to avoid implicit type coercion issues.
