# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start Vite dev server (port 5173)
npm run build    # Production build to dist/
npm run preview  # Preview production build
npm run lint     # ESLint on src/ and server/
npm run server   # Start WebSocket server (port 3000)
```

Development requires running both the WebSocket server (`npm run server`) and Vite dev server (`npm run dev`) simultaneously.

## Architecture Overview

This is a **Bubble Shooter game with phone-as-controller** built on:

- **Phaser 3** for game rendering and physics
- **Vite** for bundling
- **WebSocket** for real-time desktop-phone communication

### Multi-Client System

```
Phone Controller ─────┐
     (aim/shoot)      │
                      ├──► WebSocket Server ──► Desktop Game
                      │    (server/index.js)   (src/main.js)
   Room Codes ────────┘
```

1. **Desktop Game** (`index.html` → `src/main.js`): Phaser app with three scenes (BootScene → WaitingScene → GameScene). Displays QR code, runs game logic.

2. **Phone Controller** (`controller.html`): Standalone HTML/CSS/JS with virtual joystick. Sends aim angles and shoot commands via WebSocket.

3. **WebSocket Server** (`server/index.js`): Node.js relay with room-based pairing (6-char codes). Routes messages between desktop and phone clients. Rooms auto-expire 60s after disconnect.

### Code Organization

`src/main.js` is a single monolithic file (~3,300 lines) containing:

- `SoundManager` / `MusicManager` - Procedural Web Audio API synthesis (no audio files)
- `BootScene` / `WaitingScene` / `GameScene` - Phaser scene classes
- Game constants at top (physics, colors, grid layout, scoring)

### Key Technical Details

- **Procedural audio**: All sounds generated via Web Audio API oscillators and filters
- **Hexagonal grid**: Bubbles use offset coordinates with `ROW_HEIGHT = BUBBLE_RADIUS * Math.sqrt(3)`
- **Physics**: Custom trajectory with wall bouncing, not Phaser physics
- **Persistence**: Leaderboard stored in localStorage (max 10 entries)
- **Progressive difficulty**: Color count increases 4→8 based on score thresholds; descent speed accelerates

## Code Style

- Single quotes, semicolons required (ESLint enforced)
- camelCase for functions/variables, PascalCase for classes, UPPER_SNAKE_CASE for constants
