import { WebSocket } from 'ws';

const client = new WebSocket('ws://localhost:3000');

client.on('open', () => {
  client.close();
  process.exit(0);
});

client.on('error', () => {
  process.exit(1);
});

setTimeout(() => {
  process.exit(1);
}, 5000);
