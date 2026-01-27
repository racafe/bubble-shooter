import { WebSocketServer } from 'ws';

// Configuration
const PORT = process.env.PORT || 3000;
const ROOM_CODE_LENGTH = 6;
const ROOM_EXPIRY_MS = 60000; // 60 seconds after disconnect

// Room storage
const rooms = new Map();

// Client types
const CLIENT_TYPE = {
  DESKTOP: 'desktop',
  PHONE: 'phone'
};

/**
 * Generate a unique 6-character room code
 * @returns {string} Unique room code
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars (0, O, I, 1)
  let code;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

/**
 * Create a new room
 * @returns {object} Room object with code and clients
 */
function createRoom() {
  const code = generateRoomCode();
  const room = {
    code,
    desktop: null,
    phone: null,
    createdAt: Date.now(),
    expiryTimeout: null
  };
  rooms.set(code, room);
  console.log(`Room created: ${code}`);
  return room;
}

/**
 * Get or validate a room by code
 * @param {string} code - Room code
 * @returns {object|null} Room object or null if not found
 */
function getRoom(code) {
  return rooms.get(code) || null;
}

/**
 * Remove a room and clean up
 * @param {string} code - Room code
 */
function removeRoom(code) {
  const room = rooms.get(code);
  if (room) {
    if (room.expiryTimeout) {
      clearTimeout(room.expiryTimeout);
    }
    rooms.delete(code);
    console.log(`Room removed: ${code}`);
  }
}

/**
 * Schedule room expiry after disconnect
 * @param {object} room - Room object
 */
function scheduleRoomExpiry(room) {
  // Clear any existing expiry timeout
  if (room.expiryTimeout) {
    clearTimeout(room.expiryTimeout);
  }

  // Only schedule expiry if both clients are disconnected
  if (!room.desktop && !room.phone) {
    room.expiryTimeout = setTimeout(() => {
      removeRoom(room.code);
    }, ROOM_EXPIRY_MS);
    console.log(`Room ${room.code} scheduled for expiry in ${ROOM_EXPIRY_MS / 1000}s`);
  }
}

/**
 * Cancel room expiry when client reconnects
 * @param {object} room - Room object
 */
function cancelRoomExpiry(room) {
  if (room.expiryTimeout) {
    clearTimeout(room.expiryTimeout);
    room.expiryTimeout = null;
    console.log(`Room ${room.code} expiry cancelled`);
  }
}

/**
 * Send a message to a WebSocket client
 * @param {WebSocket} ws - WebSocket connection
 * @param {object} message - Message object
 */
function sendMessage(ws, message) {
  if (ws && ws.readyState === 1) { // WebSocket.OPEN
    ws.send(JSON.stringify(message));
  }
}

/**
 * Handle incoming message from a client
 * @param {WebSocket} ws - WebSocket connection
 * @param {object} room - Room object
 * @param {string} clientType - Client type (desktop/phone)
 * @param {object} message - Parsed message object
 */
function handleMessage(ws, room, clientType, message) {
  // Route message to the paired client
  const targetClient = clientType === CLIENT_TYPE.DESKTOP ? room.phone : room.desktop;

  if (targetClient) {
    sendMessage(targetClient, {
      type: message.type,
      data: message.data,
      from: clientType
    });
  }
}

/**
 * Handle client disconnection
 * @param {object} room - Room object
 * @param {string} clientType - Client type (desktop/phone)
 */
function handleDisconnect(room, clientType) {
  console.log(`${clientType} disconnected from room ${room.code}`);

  // Clear the client reference
  room[clientType] = null;

  // Notify the other client
  const otherClient = clientType === CLIENT_TYPE.DESKTOP ? room.phone : room.desktop;
  if (otherClient) {
    sendMessage(otherClient, {
      type: 'peer_disconnected',
      data: { clientType }
    });
  }

  // Schedule room expiry if both clients disconnected
  scheduleRoomExpiry(room);
}

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server starting on port ${PORT}...`);

wss.on('listening', () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});

wss.on('connection', (ws) => {
  let clientRoom = null;
  let clientType = null;

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      sendMessage(ws, { type: 'error', data: { message: 'Invalid JSON' } });
      return;
    }

    // Handle connection/registration messages
    if (message.type === 'create_room') {
      // Desktop client creating a new room
      const room = createRoom();
      clientRoom = room;
      clientType = CLIENT_TYPE.DESKTOP;
      room.desktop = ws;

      sendMessage(ws, {
        type: 'room_created',
        data: { roomCode: room.code }
      });
      return;
    }

    if (message.type === 'join_room') {
      // Phone client joining an existing room
      const roomCode = message.data?.roomCode?.toUpperCase();
      const room = getRoom(roomCode);

      if (!room) {
        sendMessage(ws, {
          type: 'error',
          data: { message: 'Room not found' }
        });
        return;
      }

      // Cancel expiry if room was scheduled for cleanup
      cancelRoomExpiry(room);

      clientRoom = room;
      clientType = CLIENT_TYPE.PHONE;
      room.phone = ws;

      sendMessage(ws, {
        type: 'room_joined',
        data: { roomCode: room.code }
      });

      // Notify desktop that phone connected
      if (room.desktop) {
        sendMessage(room.desktop, {
          type: 'peer_connected',
          data: { clientType: CLIENT_TYPE.PHONE }
        });
      }
      return;
    }

    if (message.type === 'reconnect') {
      // Client attempting to reconnect to existing room
      const roomCode = message.data?.roomCode?.toUpperCase();
      const reconnectType = message.data?.clientType;
      const room = getRoom(roomCode);

      if (!room) {
        sendMessage(ws, {
          type: 'error',
          data: { message: 'Room expired or not found' }
        });
        return;
      }

      // Cancel expiry
      cancelRoomExpiry(room);

      clientRoom = room;
      clientType = reconnectType;
      room[reconnectType] = ws;

      sendMessage(ws, {
        type: 'reconnected',
        data: { roomCode: room.code }
      });

      // Notify the other client
      const otherClient = reconnectType === CLIENT_TYPE.DESKTOP ? room.phone : room.desktop;
      if (otherClient) {
        sendMessage(otherClient, {
          type: 'peer_reconnected',
          data: { clientType: reconnectType }
        });
      }
      return;
    }

    // All other messages require an established room connection
    if (!clientRoom || !clientType) {
      sendMessage(ws, {
        type: 'error',
        data: { message: 'Not connected to a room' }
      });
      return;
    }

    // Route the message to the paired client
    handleMessage(ws, clientRoom, clientType, message);
  });

  ws.on('close', () => {
    if (clientRoom && clientType) {
      handleDisconnect(clientRoom, clientType);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
    if (clientRoom && clientType) {
      handleDisconnect(clientRoom, clientType);
    }
  });
});

wss.on('error', (error) => {
  console.error('Server error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { wss, rooms, generateRoomCode, createRoom, getRoom, removeRoom };
