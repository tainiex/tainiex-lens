# Tainiex Lens

A modern collaborative note-taking and chat application built with React and Vite, featuring real-time collaboration powered by Y.js CRDT and WebSocket communication.

## Logging

This project uses a centralized logger at `src/shared/utils/logger.ts`.

### Log Level

Log level is controlled by the Vite env var `VITE_LOG_LEVEL`:

- `debug` | `log` | `warn` | `error`

**Defaults:**

- **Development**: `debug`
- **Production**: `warn` (default)

This means `debug`/`log` output is suppressed in production by default, while `warn`/`error` remain visible.

### Example `.env` setup

```bash
# Development (verbose)
VITE_LOG_LEVEL=debug

# Production (default behavior)
VITE_LOG_LEVEL=warn
```

> Tip: Route ad-hoc diagnostics through `logger.debug(...)` instead of `console.log(...)` so they respect the global log level and production defaults.

## Architecture Overview

This is a **Pure Frontend Application** structured as a standard Vite project.

```
tainiex-lens/
├── src/
│   ├── components/   # React Components
│   ├── pages/        # Application Pages
│   ├── shared/       # Shared Business Logic (API, Socket, Types)
│   └── ...
├── package.json      # Project Dependencies
└── vite.config.ts    # Build Configuration
```

### Technology Stack

- **Frontend**: React 18.3.1, TypeScript 5.x
- **Build Tool**: Vite 7.x
- **Rich Text Editor**: TipTap v3 with Y.js collaboration
- **Real-time Communication**: Socket.IO
- **Collaboration**: Y.js CRDT (Conflict-free Replicated Data Types)
- **UI Styling**: CSS Modules / Custom Components
- **State Management**: React Hooks + Context API
- **Authentication**: JWT + OAuth (Google, Microsoft)

## Quick Start

### Prerequisites

- Node.js >= 20.x
- Yarn 1.22.x
- **Shared Atlas**: `@tainiex/shared-atlas` (Private) is the authoritative source for all Data Transfer Objects (DTOs) and API interfaces.

### Installation

1. **Configure Credentials**:
   Create a `.npmrc` file in the project root to access private packages:

    ```ini
    @tainiex:registry=https://npm.pkg.github.com
    //npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT_HERE
    ```

    _Note: Requires a GitHub Personal Access Token with `read:packages` scope._

2. **Install Dependencies**:
    ```bash
    yarn install
    ```

### Development

```bash
# Start development server
yarn dev
```

Access the app at `http://localhost:2000`

### Building for Production

```bash
# Build production bundle
yarn build

# Preview production build
yarn preview
```

## Project Structure

### `src/shared`

Formerly a separate package, this directory now contains all core business logic to differentiate it from UI components.

- **Services**: `SocketService`, `YDocManager`, `ApiClient`
- **Hooks**: `useChat`, `useCollaborationSocket`
- **Utils**: API client, logging, validation
- **Types**: Shared TypeScript interfaces

## Environment Configuration

Create a `.env` file in the root directory:

```bash
VITE_API_BASE_URL=http://localhost:2020
VITE_SENTRY_DSN=your_sentry_dsn
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_MSAL_CLIENT_ID=your_microsoft_client_id
VITE_CLARITY_ID=your_clarity_id
```

## Key Features

- **Real-time Collaboration**: Multiple users can edit documents simultaneously using Y.js CRDT.
- **Rich Text Editing**: TipTap editor with Markdown support, slash commands, and code highlighting.
- **Chat System**: Real-time messaging with Socket.IO.
- **Secure Authentication**: HttpOnly cookie-based authentication.

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -m "feat: add feature"`
3. Push and create a pull request.

This project follows **Conventional Commits**.
