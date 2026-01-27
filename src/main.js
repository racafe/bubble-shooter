import Phaser from 'phaser';
import QRCode from 'qrcode';

// Configuration
const WS_URL = `ws://${window.location.hostname}:3000`;
const CONTROLLER_BASE_URL = `http://${window.location.hostname}:5173/controller.html`;

// Bubble colors for the game
const BUBBLE_COLORS = [
  0xff6b6b, // Red
  0x4ecdc4, // Teal
  0xffe66d, // Yellow
  0x95e1d3, // Mint
  0xf38181, // Coral
  0xaa96da, // Purple
];

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.score = 0;
    this.currentBubbleColor = null;
    this.nextBubbleColor = null;
  }

  init(data) {
    // Receive WebSocket connection from WaitingScene
    this.ws = data.ws;
  }

  create() {
    const { width, height } = this.cameras.main;

    // Create cartoon-style gradient background
    this.createGradientBackground(width, height);

    // Create visible wall boundaries
    this.createWalls(width, height);

    // Create score display in top-left corner
    this.createScoreDisplay();

    // Initialize bubble colors
    this.currentBubbleColor = Phaser.Utils.Array.GetRandom(BUBBLE_COLORS);
    this.nextBubbleColor = Phaser.Utils.Array.GetRandom(BUBBLE_COLORS);

    // Create shooter and bubble displays at bottom-center
    this.createShooter(width, height);

    // Listen for shoot commands from controller
    if (this.ws) {
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'game_message' && message.data.type === 'shoot') {
          this.handleShoot(message.data.angle);
        }
      };
    }
  }

  createGradientBackground(width, height) {
    // Create a gradient texture programmatically
    const gradientTexture = this.textures.createCanvas('gradient-bg', width, height);
    const ctx = gradientTexture.getContext();

    // Cartoon-style gradient from sky blue to soft purple
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#667eea');    // Purple-blue at top
    gradient.addColorStop(0.5, '#764ba2');  // Purple in middle
    gradient.addColorStop(1, '#f093fb');    // Pink-purple at bottom

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    gradientTexture.refresh();

    // Add the background image
    this.add.image(width / 2, height / 2, 'gradient-bg');
  }

  createWalls(width, height) {
    const wallThickness = 10;
    const wallColor = 0x2d3436;
    const wallAlpha = 0.8;

    // Game area dimensions (leave space for UI)
    const gameTop = 60;  // Space for score
    const gameBottom = height - 100;  // Space for shooter
    const gameLeft = 20;
    const gameRight = width - 20;

    // Left wall
    this.add.rectangle(
      gameLeft,
      (gameTop + gameBottom) / 2,
      wallThickness,
      gameBottom - gameTop,
      wallColor,
      wallAlpha
    ).setStrokeStyle(2, 0xffffff, 0.3);

    // Right wall
    this.add.rectangle(
      gameRight,
      (gameTop + gameBottom) / 2,
      wallThickness,
      gameBottom - gameTop,
      wallColor,
      wallAlpha
    ).setStrokeStyle(2, 0xffffff, 0.3);

    // Top wall
    this.add.rectangle(
      width / 2,
      gameTop,
      gameRight - gameLeft,
      wallThickness,
      wallColor,
      wallAlpha
    ).setStrokeStyle(2, 0xffffff, 0.3);

    // Bottom boundary line (dashed effect with multiple segments)
    const dashWidth = 20;
    const gapWidth = 10;
    let x = gameLeft + dashWidth / 2;

    while (x < gameRight) {
      this.add.rectangle(
        x,
        gameBottom,
        dashWidth,
        4,
        0xffffff,
        0.5
      );
      x += dashWidth + gapWidth;
    }

    // Store game area bounds for later use
    this.gameArea = {
      left: gameLeft + wallThickness / 2,
      right: gameRight - wallThickness / 2,
      top: gameTop + wallThickness / 2,
      bottom: gameBottom
    };
  }

  createScoreDisplay() {
    // Score background panel
    this.add.rectangle(80, 30, 140, 40, 0x000000, 0.4)
      .setStrokeStyle(2, 0xffffff, 0.3);

    // Score label
    this.add.text(20, 20, 'SCORE', {
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold'
    });

    // Score value
    this.scoreText = this.add.text(20, 35, '0', {
      fontSize: '20px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffe66d',
      fontStyle: 'bold'
    });
  }

  createShooter(width, height) {
    const shooterY = height - 50;
    const shooterX = width / 2;

    // Shooter base (semi-circle platform)
    this.add.arc(shooterX, shooterY + 20, 50, 180, 0, false, 0x2d3436, 0.9)
      .setStrokeStyle(3, 0xffffff, 0.4);

    // Shooter cannon/tube
    this.shooterCannon = this.add.rectangle(
      shooterX,
      shooterY - 10,
      16,
      40,
      0x636e72,
      1
    ).setStrokeStyle(2, 0xffffff, 0.5);

    // Current bubble to shoot (positioned at cannon tip)
    this.currentBubble = this.add.circle(
      shooterX,
      shooterY - 35,
      20,
      this.currentBubbleColor
    ).setStrokeStyle(3, 0xffffff, 0.8);

    // Add shine effect to current bubble
    this.add.circle(
      shooterX - 6,
      shooterY - 41,
      5,
      0xffffff,
      0.6
    );

    // Next bubble preview (smaller, to the right)
    const previewX = shooterX + 80;
    const previewY = shooterY;

    // Preview label
    this.add.text(previewX - 25, previewY - 35, 'NEXT', {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold'
    });

    // Preview bubble background
    this.add.circle(previewX, previewY, 18, 0x000000, 0.3)
      .setStrokeStyle(2, 0xffffff, 0.3);

    // Next bubble preview
    this.nextBubble = this.add.circle(
      previewX,
      previewY,
      15,
      this.nextBubbleColor
    ).setStrokeStyle(2, 0xffffff, 0.6);

    // Add shine to preview bubble
    this.add.circle(
      previewX - 4,
      previewY - 4,
      3,
      0xffffff,
      0.5
    );
  }

  handleShoot(_angle) {
    // For now, just cycle the bubbles as visual feedback
    // Full shooting mechanics will be implemented in later stories
    // _angle parameter will be used for actual shooting trajectory

    // Move next bubble to current
    this.currentBubbleColor = this.nextBubbleColor;
    this.currentBubble.setFillStyle(this.currentBubbleColor);

    // Generate new next bubble
    this.nextBubbleColor = Phaser.Utils.Array.GetRandom(BUBBLE_COLORS);
    this.nextBubble.setFillStyle(this.nextBubbleColor);
  }

  updateScore(points) {
    this.score += points;
    this.scoreText.setText(this.score.toString());
  }
}

class WaitingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WaitingScene' });
    this.ws = null;
    this.roomCode = null;
    this.qrImage = null;
    this.waitingText = null;
    this.connectedText = null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1a2e');

    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    // Title
    this.add.text(centerX, 50, 'Bubble Shooter', {
      fontSize: '48px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);

    // QR code placeholder - will be positioned after generation
    this.qrContainer = this.add.container(centerX, centerY - 30);

    // Waiting text below QR code area
    this.waitingText = this.add.text(centerX, centerY + 150, 'Connecting to server...', {
      fontSize: '24px',
      fontFamily: 'Arial, sans-serif',
      color: '#888888',
    }).setOrigin(0.5);

    // Room code display (initially hidden)
    this.roomCodeText = this.add.text(centerX, centerY + 190, '', {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: '#666666',
    }).setOrigin(0.5);

    // Connected confirmation text (initially hidden)
    this.connectedText = this.add.text(centerX, centerY, 'Controller connected!', {
      fontSize: '32px',
      fontFamily: 'Arial, sans-serif',
      color: '#4ade80',
    }).setOrigin(0.5).setVisible(false);

    // Connect to WebSocket server
    this.connectWebSocket();
  }

  connectWebSocket() {
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      // Request a new room
      this.ws.send(JSON.stringify({ type: 'create_room' }));
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = () => {
      this.waitingText.setText('Connection error. Is server running?');
      this.waitingText.setColor('#ef4444');
    };

    this.ws.onclose = () => {
      if (!this.roomCode) {
        this.waitingText.setText('Server disconnected');
        this.waitingText.setColor('#ef4444');
      }
    };
  }

  handleMessage(message) {
    switch (message.type) {
      case 'room_created':
        this.roomCode = message.data.roomCode;
        this.generateQRCode();
        break;
      case 'peer_connected':
        this.onControllerConnected();
        break;
      case 'peer_disconnected':
        this.onControllerDisconnected();
        break;
    }
  }

  async generateQRCode() {
    const controllerUrl = `${CONTROLLER_BASE_URL}?room=${this.roomCode}`;

    try {
      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(controllerUrl, {
        width: 220,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      // Load as Phaser texture
      this.textures.addBase64('qrcode', qrDataUrl);

      // Wait for texture to load
      this.textures.once('addtexture', () => {
        this.displayQRCode();
      });
    } catch {
      this.waitingText.setText('Failed to generate QR code');
      this.waitingText.setColor('#ef4444');
    }
  }

  displayQRCode() {
    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    // Add QR code image
    this.qrImage = this.add.image(centerX, centerY - 30, 'qrcode');

    // Update waiting text
    this.waitingText.setText('Waiting for controller...');
    this.waitingText.setColor('#888888');

    // Show room code
    this.roomCodeText.setText(`Room: ${this.roomCode}`);
  }

  onControllerConnected() {
    // Hide QR code and waiting elements
    if (this.qrImage) {
      this.qrImage.setVisible(false);
    }
    this.waitingText.setVisible(false);
    this.roomCodeText.setVisible(false);

    // Show connected confirmation
    this.connectedText.setVisible(true);

    // After brief confirmation, transition to game scene
    this.time.delayedCall(1500, () => {
      this.scene.start('GameScene', { ws: this.ws });
    });
  }

  onControllerDisconnected() {
    // Show QR code again if controller disconnects
    if (this.qrImage) {
      this.qrImage.setVisible(true);
    }
    this.waitingText.setText('Controller disconnected. Scan to reconnect...');
    this.waitingText.setColor('#f59e0b');
    this.waitingText.setVisible(true);
    this.roomCodeText.setVisible(true);
    this.connectedText.setVisible(false);
  }

  shutdown() {
    // Clean up WebSocket on scene shutdown
    if (this.ws) {
      this.ws.close();
    }
  }
}

class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    // Immediately transition to WaitingScene
    this.scene.start('WaitingScene');
  }
}

const config = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  scene: [BootScene, WaitingScene, GameScene],
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
};

const game = new Phaser.Game(config);

export default game;
