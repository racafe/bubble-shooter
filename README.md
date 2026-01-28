# Bubble Shooter

A physics-based bubble shooter game with a unique phone-as-controller feature. Play on your desktop while using your phone as a wireless controller.

## Features

- **Phone Controller**: Use your smartphone as a wireless joystick to aim and shoot
- **Real-time Connection**: WebSocket-powered instant response between phone and game
- **QR Code Pairing**: Scan to connect your phone instantly
- **Procedural Audio**: All sound effects generated via Web Audio API (no audio files)
- **Progressive Difficulty**: Color count increases from 4 to 8 as you score higher
- **Local Leaderboard**: Track your high scores with initials

## How to Play

1. Start both the game server and web client (see below)
2. On your desktop, a QR code will appear
3. Scan the QR code with your phone to open the controller
4. Use the virtual joystick on your phone to aim
5. Tap to shoot bubbles
6. Match 3+ bubbles of the same color to pop them
7. Clear all bubbles before they reach the bottom

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)

### Installation

```bash
npm install
```

### Running the Game

You need to run both servers simultaneously:

**Terminal 1 - WebSocket Server:**
```bash
npm run server
```

**Terminal 2 - Development Server:**
```bash
npm run dev
```

Then open http://localhost:5173 in your browser.

### Production Build

```bash
npm run build
npm run preview
```

## Tech Stack

- **Phaser 3** - Game framework
- **Vite** - Build tool and dev server
- **WebSocket (ws)** - Real-time communication
- **Web Audio API** - Procedural sound synthesis

## Architecture

```
Phone Controller ─────┐
     (aim/shoot)      │
                      ├──► WebSocket Server ──► Desktop Game
                      │    (server/index.js)   (src/main.js)
   Room Codes ────────┘
```

- **Desktop Game**: Phaser app with BootScene, WaitingScene, and GameScene
- **Phone Controller**: Standalone HTML/JS with virtual joystick
- **WebSocket Server**: Node.js relay with room-based pairing (6-character codes)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Production build to dist/ |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint on src/ and server/ |
| `npm run server` | Start WebSocket server (port 3000) |

## License

ISC
