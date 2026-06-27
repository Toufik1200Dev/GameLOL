/**
 * Server bootstrap: HTTP (Express) for health/diagnostics + Socket.IO for the
 * authoritative real-time layer. Lobby handling is attached via
 * `attachSocketHandlers`; the game simulation layer plugs in here in Phase 3.
 */
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import {
  TICK_RATE,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@game/shared';
import { env } from './env';
import { logger } from './logger';
import { attachSocketHandlers } from './net/socketHandlers';

const app = express();
app.use(cors({ origin: env.clientOrigin }));
app.use(express.json());

/** Liveness/health endpoint (used by Docker, load balancers, and quick checks). */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', tickRate: TICK_RATE, uptime: process.uptime() });
});

app.get('/', (_req, res) => {
  res.type('text/plain').send('gameonline authoritative server is running.');
});

const httpServer = createServer(app);

const io = new SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: { origin: env.clientOrigin, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

attachSocketHandlers(io);

httpServer.listen(env.port, () => {
  logger.info(`Server listening on :${env.port} (env=${env.nodeEnv}, tick=${TICK_RATE}Hz)`);
  logger.info(
    `CORS origin: ${env.clientOrigin === '*' ? '*' : (env.clientOrigin as string[]).join(', ')}`,
  );
});

const shutdown = (signal: string): void => {
  logger.info(`Received ${signal}, shutting down...`);
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { io, httpServer };
