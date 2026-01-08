# Tainiex Lens

Tainiex Lens is the frontend interface for the Tainiex AI Memory & Knowledge Infrastructure. It provides a robust, user-friendly dashboard for interacting with AI agents, managing long-term memory, and visualizing knowledge graphs.

## Core Features

- **Authentication**: Secure login via Google & Microsoft OAuth with backend verification and cookie-based session management.
- **Adaptive Dashboard**: A responsive, full-height adaptive interface that eliminates unnecessary scrollbars.
- **Chat & Collaboration**: Real-time chat (via `/api/chat`) and shared notes (via `/api/collaboration`) using a single multiplexed WebSocket connection. Features robust auto-reconnection, centralized authentication handling, and optimized mobile sleep/wake behavior.
- **Rich Content Rendering**: Advanced support for Markdown (GFM), LaTeX mathematical formulas (via KaTeX), and Mermaid DSL diagrams.
- **Context Panel**: Sidebar panel for displaying relevant context and memories.
- **Efficient Layout**: Sticky footer design ensuring content fills the screen gracefully on all devices.

## Tech Stack

- **Framework**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Routing**: [React Router](https://reactrouter.com/)
- **Authentication**: @react-oauth/google (refresh token requests now include `credentials: 'include'` to ensure cookies are sent)
- **Styling**: Vanilla CSS with CSS Variables
- **Shared Library**: @tainiex/tainiex-shared (Private GitHub Package)

## Prerequisites

Before starting, ensure you have:

- **Node.js** (v18+ recommended)
- **GitHub Personal Access Token (PAT)** with `read:packages` scope.

## Configuration & Installation

### 1. Configure Private NPM Registry

This project relies on a private package `@tainiex/tainiex-shared` hosted on GitHub Packages. You must configure your npm environment to authenticate.

1.  Create a `.npmrc` file in the project root (if not already present) with the following content:

    ```ini
    @tainiex:registry=https://npm.pkg.github.com
    //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
    ```

    *Note: Replace `${GITHUB_TOKEN}` with your actual token or set it as an environment variable.*

### 2. Environment Variables

Create a `.env` file in the root directory:

```properties
VITE_API_BASE_URL=
VITE_WS_CHAT_URL=
VITE_GOOGLE_CLIENT_ID=your_client_id_here
VITE_MICROSOFT_CLIENT_ID=your_microsoft_client_id_here
VITE_MICROSOFT_TENANT_ID=common
```

*Note: The project uses Vite's proxy to handle API and WebSocket connections. In development, `VITE_API_BASE_URL` can be left empty as the proxy targets `http://localhost:2020` by default in `vite.config.ts`.*

### 3. Install Dependencies

```bash
npm install
```

## Running the Project

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:2000` (or the port specified in your console).

## Project Structure

- `src/pages`: Main application views (Home, Login, AppDashboard).
- `src/components`: Reusable UI components (Sidebar, ChatInterface, Header).
- `src/App.tsx`: Main routing and layout configuration.
- `vite.config.ts`: Vite configuration including API proxy settings.

## License

Private / Proprietary.
