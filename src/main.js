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

// Physics constants
const BUBBLE_SPEED = 800;
const BUBBLE_RADIUS = 20;

// Grid constants for hexagonal layout
const GRID_ROWS = 5; // Initial rows of bubbles
const BUBBLE_DIAMETER = BUBBLE_RADIUS * 2;
const ROW_HEIGHT = BUBBLE_DIAMETER * 0.866; // sqrt(3)/2 for hex packing

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.score = 0;
    this.currentBubbleColor = null;
    this.nextBubbleColor = null;
    this.shootingBubble = null;
    this.isAiming = false;
    this.aimAngle = 90; // Default to straight up (degrees)
    this.trajectoryGraphics = null;
    // Grid system for attached bubbles
    this.gridBubbles = []; // Array of {x, y, row, col, color, sprite, shine}
    this.gridStartY = 0; // Y position of first row (set after walls created)
    this.gridStartX = 0; // X position of first bubble in row 0
    this.bubblesPerRow = 0; // Calculated based on game area width
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

    // Create trajectory preview graphics
    this.trajectoryGraphics = this.add.graphics();

    // Initialize the bubble grid
    this.initializeGrid(width);

    // Create initial rows of bubbles
    this.createInitialBubbles();

    // Listen for shoot and aim commands from controller
    if (this.ws) {
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'game_message') {
          if (message.data.type === 'shoot') {
            this.handleShoot(message.data.angle);
          } else if (message.data.type === 'aim') {
            this.handleAim(message.data.angle);
          }
        }
      };
    }
  }

  update() {
    // Update shooting bubble physics
    if (this.shootingBubble && this.shootingBubble.active) {
      this.updateShootingBubble();
    }
  }

  updateShootingBubble() {
    const bubble = this.shootingBubble;
    const delta = this.game.loop.delta / 1000;

    // Move bubble first
    bubble.x += bubble.velocityX * delta;
    bubble.y += bubble.velocityY * delta;

    // Check for wall bounces (left and right)
    if (bubble.x - BUBBLE_RADIUS <= this.gameArea.left) {
      bubble.x = this.gameArea.left + BUBBLE_RADIUS;
      bubble.velocityX = Math.abs(bubble.velocityX); // Bounce right
      bubble.rotationSpeed = Math.abs(bubble.rotationSpeed); // Rotate based on direction
    } else if (bubble.x + BUBBLE_RADIUS >= this.gameArea.right) {
      bubble.x = this.gameArea.right - BUBBLE_RADIUS;
      bubble.velocityX = -Math.abs(bubble.velocityX); // Bounce left
      bubble.rotationSpeed = -Math.abs(bubble.rotationSpeed); // Rotate based on direction
    }

    // Check for ceiling collision (stick immediately)
    if (bubble.y - BUBBLE_RADIUS <= this.gameArea.top) {
      bubble.y = this.gameArea.top + BUBBLE_RADIUS;
      this.stickBubble(bubble);
      return;
    }

    // Check for collision with existing grid bubbles
    const collisionBubble = this.checkGridCollision(bubble.x, bubble.y);
    if (collisionBubble) {
      this.stickBubble(bubble);
      return;
    }

    // Rotate bubble while moving
    bubble.rotation += bubble.rotationSpeed * delta;

    // Update shine position
    if (bubble.updateShine) {
      bubble.updateShine();
    }
  }

  checkGridCollision(x, y) {
    // Check if shooting bubble collides with any grid bubble
    const collisionDist = BUBBLE_DIAMETER * 0.9; // Slightly less than 2 radii for snug fit

    for (const gridBubble of this.gridBubbles) {
      const dist = Phaser.Math.Distance.Between(x, y, gridBubble.x, gridBubble.y);
      if (dist < collisionDist) {
        return gridBubble;
      }
    }

    return null;
  }

  stickBubble(bubble) {
    // Stop the bubble and mark it as stuck
    bubble.velocityX = 0;
    bubble.velocityY = 0;
    bubble.rotationSpeed = 0;
    bubble.active = false;

    // Find the nearest valid empty cell
    const targetCell = this.findNearestEmptyCell(bubble.x, bubble.y);

    if (targetCell && this.hasAdjacentBubble(targetCell.row, targetCell.col)) {
      // Animate snap to grid position
      this.snapBubbleToGrid(bubble, targetCell);
    } else {
      // No valid position found - shouldn't happen normally
      // Destroy the bubble
      if (bubble.shine) bubble.shine.destroy();
      bubble.destroy();
    }

    this.shootingBubble = null;
  }

  snapBubbleToGrid(bubble, targetCell) {
    const targetPos = targetCell.pos;

    // Create snap animation using tween
    this.tweens.add({
      targets: bubble,
      x: targetPos.x,
      y: targetPos.y,
      duration: 50, // Quick snap
      ease: 'Power2',
      onUpdate: () => {
        // Update shine position during tween
        if (bubble.shine) {
          bubble.shine.x = bubble.x - 6;
          bubble.shine.y = bubble.y - 6;
        }
      },
      onComplete: () => {
        // Create the visual snap effect
        this.createSnapEffect(targetPos.x, targetPos.y);

        // Destroy the shooting bubble visuals
        if (bubble.shine) bubble.shine.destroy();
        bubble.destroy();

        // Add bubble to grid data structure
        this.addBubbleToGrid(targetCell.row, targetCell.col, bubble.color);
      }
    });
  }

  createSnapEffect(x, y) {
    // Create a satisfying visual "pop" effect when bubble snaps to grid
    const ring = this.add.circle(x, y, BUBBLE_RADIUS, 0xffffff, 0);
    ring.setStrokeStyle(3, 0xffffff, 0.8);

    // Expand and fade ring
    this.tweens.add({
      targets: ring,
      radius: BUBBLE_RADIUS * 1.5,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        // Update stroke as ring expands
        ring.setStrokeStyle(3 * (1 - ring.alpha), 0xffffff, ring.alpha * 0.8);
      },
      onComplete: () => {
        ring.destroy();
      }
    });

    // Add small particles bursting outward
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const particle = this.add.circle(
        x + Math.cos(angle) * BUBBLE_RADIUS * 0.5,
        y + Math.sin(angle) * BUBBLE_RADIUS * 0.5,
        3,
        0xffffff,
        0.7
      );

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * BUBBLE_RADIUS * 1.8,
        y: y + Math.sin(angle) * BUBBLE_RADIUS * 1.8,
        alpha: 0,
        scale: 0.3,
        duration: 150,
        ease: 'Quad.easeOut',
        onComplete: () => {
          particle.destroy();
        }
      });
    }
  }

  handleAim(angle) {
    this.isAiming = true;
    this.aimAngle = angle;
    this.drawTrajectory(angle);
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

  initializeGrid(_width) {
    // Calculate grid parameters based on game area
    const gameAreaWidth = this.gameArea.right - this.gameArea.left;
    this.bubblesPerRow = Math.floor(gameAreaWidth / BUBBLE_DIAMETER);

    // Center the grid within the game area
    const totalGridWidth = this.bubblesPerRow * BUBBLE_DIAMETER;
    const leftPadding = (gameAreaWidth - totalGridWidth) / 2;
    this.gridStartX = this.gameArea.left + leftPadding + BUBBLE_RADIUS;
    this.gridStartY = this.gameArea.top + BUBBLE_RADIUS;
  }

  createInitialBubbles() {
    // Create GRID_ROWS of bubbles at the top
    for (let row = 0; row < GRID_ROWS; row++) {
      // Odd rows have one fewer bubble and are offset
      const isOddRow = row % 2 === 1;
      const bubblesInRow = isOddRow ? this.bubblesPerRow - 1 : this.bubblesPerRow;

      for (let col = 0; col < bubblesInRow; col++) {
        const color = Phaser.Utils.Array.GetRandom(BUBBLE_COLORS);
        this.addBubbleToGrid(row, col, color);
      }
    }
  }

  getGridPosition(row, col) {
    // Calculate world position from grid row/col
    const isOddRow = row % 2 === 1;
    const xOffset = isOddRow ? BUBBLE_RADIUS : 0;

    const x = this.gridStartX + col * BUBBLE_DIAMETER + xOffset;
    const y = this.gridStartY + row * ROW_HEIGHT;

    return { x, y };
  }

  getGridCell(worldX, worldY) {
    // Convert world position to nearest grid cell
    const row = Math.round((worldY - this.gridStartY) / ROW_HEIGHT);
    const isOddRow = row % 2 === 1;
    const xOffset = isOddRow ? BUBBLE_RADIUS : 0;
    const col = Math.round((worldX - this.gridStartX - xOffset) / BUBBLE_DIAMETER);

    return { row, col };
  }

  isValidGridCell(row, col) {
    // Check if a grid cell is valid (within bounds)
    if (row < 0) return false;
    const isOddRow = row % 2 === 1;
    const maxCols = isOddRow ? this.bubblesPerRow - 1 : this.bubblesPerRow;
    return col >= 0 && col < maxCols;
  }

  getBubbleAtCell(row, col) {
    // Find bubble at specific grid cell
    return this.gridBubbles.find(b => b.row === row && b.col === col);
  }

  addBubbleToGrid(row, col, color) {
    // Check if cell is valid
    if (!this.isValidGridCell(row, col)) return null;

    // Check if cell is already occupied
    if (this.getBubbleAtCell(row, col)) return null;

    const pos = this.getGridPosition(row, col);

    // Create bubble sprite
    const sprite = this.add.circle(pos.x, pos.y, BUBBLE_RADIUS, color)
      .setStrokeStyle(2, 0xffffff, 0.6);

    // Add shine effect
    const shine = this.add.circle(pos.x - 6, pos.y - 6, 4, 0xffffff, 0.5);

    const bubbleData = {
      row,
      col,
      x: pos.x,
      y: pos.y,
      color,
      sprite,
      shine
    };

    this.gridBubbles.push(bubbleData);
    return bubbleData;
  }

  findNearestEmptyCell(worldX, worldY) {
    // Find the best empty cell near the given position
    const cell = this.getGridCell(worldX, worldY);

    // Check the calculated cell and nearby cells for the best fit
    const candidates = [];

    // Check cells in a small area around the impact point
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const testRow = cell.row + dr;
        const testCol = cell.col + dc;

        if (this.isValidGridCell(testRow, testCol) && !this.getBubbleAtCell(testRow, testCol)) {
          const pos = this.getGridPosition(testRow, testCol);
          const dist = Phaser.Math.Distance.Between(worldX, worldY, pos.x, pos.y);
          candidates.push({ row: testRow, col: testCol, dist, pos });
        }
      }
    }

    // Return the closest valid empty cell
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.dist - b.dist);
      return candidates[0];
    }

    return null;
  }

  getNeighbors(row, col) {
    // Get all valid neighboring cells for hexagonal grid
    const isOddRow = row % 2 === 1;
    const neighbors = [];

    // Even rows: (-1,-1), (-1,0), (0,-1), (0,1), (1,-1), (1,0)
    // Odd rows:  (-1,0), (-1,1), (0,-1), (0,1), (1,0), (1,1)
    const offsets = isOddRow
      ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
      : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];

    for (const [dr, dc] of offsets) {
      const newRow = row + dr;
      const newCol = col + dc;
      if (this.isValidGridCell(newRow, newCol)) {
        neighbors.push({ row: newRow, col: newCol });
      }
    }

    return neighbors;
  }

  hasAdjacentBubble(row, col) {
    // Check if position has at least one adjacent bubble (or is in top row)
    if (row === 0) return true; // Top row is always connected to ceiling

    const neighbors = this.getNeighbors(row, col);
    return neighbors.some(n => this.getBubbleAtCell(n.row, n.col) !== undefined);
  }

  handleShoot(angle) {
    // Don't shoot if already shooting
    if (this.shootingBubble && this.shootingBubble.active) {
      return;
    }

    // Clear trajectory preview
    this.trajectoryGraphics.clear();
    this.isAiming = false;

    // Calculate velocity from angle (angle is in degrees, 90 = straight up)
    const radians = Phaser.Math.DegToRad(angle);
    const velocityX = Math.cos(radians) * BUBBLE_SPEED;
    const velocityY = -Math.sin(radians) * BUBBLE_SPEED; // Negative because Y increases downward

    // Get shooter position
    const { width, height } = this.cameras.main;
    const shooterX = width / 2;
    const shooterY = height - 50 - 35; // Same as currentBubble position

    // Create shooting bubble
    this.shootingBubble = this.add.circle(
      shooterX,
      shooterY,
      BUBBLE_RADIUS,
      this.currentBubbleColor
    ).setStrokeStyle(3, 0xffffff, 0.8);

    // Add shine effect
    const shine = this.add.circle(
      shooterX - 6,
      shooterY - 6,
      5,
      0xffffff,
      0.6
    );
    this.shootingBubble.shine = shine;

    // Set physics properties
    this.shootingBubble.velocityX = velocityX;
    this.shootingBubble.velocityY = velocityY;
    this.shootingBubble.active = true;
    this.shootingBubble.color = this.currentBubbleColor;

    // Add rotation based on horizontal direction
    this.shootingBubble.rotationSpeed = velocityX > 0 ? 5 : -5;

    // Move shine with bubble in update
    this.shootingBubble.updateShine = () => {
      if (this.shootingBubble && shine) {
        shine.x = this.shootingBubble.x - 6;
        shine.y = this.shootingBubble.y - 6;
      }
    };

    // Cycle colors for next shot
    this.currentBubbleColor = this.nextBubbleColor;
    this.currentBubble.setFillStyle(this.currentBubbleColor);

    this.nextBubbleColor = Phaser.Utils.Array.GetRandom(BUBBLE_COLORS);
    this.nextBubble.setFillStyle(this.nextBubbleColor);
  }

  drawTrajectory(angle) {
    this.trajectoryGraphics.clear();

    // Calculate starting position
    const { width, height } = this.cameras.main;
    const startX = width / 2;
    const startY = height - 50 - 35;

    // Calculate direction vector
    const radians = Phaser.Math.DegToRad(angle);
    let dx = Math.cos(radians);
    let dy = -Math.sin(radians);

    // Simulate trajectory with bounces
    let x = startX;
    let y = startY;
    const points = [{ x, y }];
    const maxBounces = 3;
    let bounces = 0;
    const stepSize = 10;
    const maxSteps = 200;
    let hitBubble = false;

    for (let step = 0; step < maxSteps && bounces <= maxBounces && !hitBubble; step++) {
      x += dx * stepSize;
      y += dy * stepSize;

      // Check wall bounces
      if (x - BUBBLE_RADIUS <= this.gameArea.left) {
        x = this.gameArea.left + BUBBLE_RADIUS;
        dx = Math.abs(dx);
        bounces++;
        points.push({ x, y, bounce: true });
      } else if (x + BUBBLE_RADIUS >= this.gameArea.right) {
        x = this.gameArea.right - BUBBLE_RADIUS;
        dx = -Math.abs(dx);
        bounces++;
        points.push({ x, y, bounce: true });
      }

      // Check ceiling
      if (y - BUBBLE_RADIUS <= this.gameArea.top) {
        y = this.gameArea.top + BUBBLE_RADIUS;
        points.push({ x, y });
        break;
      }

      // Check collision with grid bubbles
      if (this.checkGridCollision(x, y)) {
        hitBubble = true;
        points.push({ x, y });
        break;
      }

      // Add point for line drawing (every few steps for performance)
      if (step % 3 === 0) {
        points.push({ x, y });
      }
    }

    // Draw trajectory as dashed line
    this.trajectoryGraphics.lineStyle(2, 0xffffff, 0.5);

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Draw dashed segments
      const segmentLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const dashLength = 8;
      const gapLength = 6;
      const dashCount = Math.floor(segmentLength / (dashLength + gapLength));

      const dirX = (p2.x - p1.x) / segmentLength;
      const dirY = (p2.y - p1.y) / segmentLength;

      for (let d = 0; d < dashCount; d++) {
        const dashStart = d * (dashLength + gapLength);
        const dashEnd = dashStart + dashLength;

        this.trajectoryGraphics.beginPath();
        this.trajectoryGraphics.moveTo(
          p1.x + dirX * dashStart,
          p1.y + dirY * dashStart
        );
        this.trajectoryGraphics.lineTo(
          p1.x + dirX * Math.min(dashEnd, segmentLength),
          p1.y + dirY * Math.min(dashEnd, segmentLength)
        );
        this.trajectoryGraphics.strokePath();
      }

      // Draw bounce indicator
      if (p2.bounce) {
        this.trajectoryGraphics.fillStyle(0xffffff, 0.7);
        this.trajectoryGraphics.fillCircle(p2.x, p2.y, 4);
      }
    }

    // Draw target indicator at end
    const lastPoint = points[points.length - 1];
    this.trajectoryGraphics.lineStyle(2, 0xffffff, 0.6);
    this.trajectoryGraphics.strokeCircle(lastPoint.x, lastPoint.y, BUBBLE_RADIUS);
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
