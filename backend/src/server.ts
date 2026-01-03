import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import plansSyncRouter from './routes/plans-sync';
import accountsConnectRouter from './routes/accounts-connect';
import analyticsRouter from './routes/analytics';
import { testConnection } from './database/connection';
import { formatError } from './utils/errors';
import { startRuleCheckerWorker } from './workers/rule-checker';
import { startDailyResetWorker } from './workers/daily-reset';

config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (_req: Request, res: Response) => {
  const dbConnected = await testConnection();
  res.json({
    status: 'ok',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/plans', plansSyncRouter);
app.use('/api/accounts', accountsConnectRouter);
app.use('/api/analytics', analyticsRouter);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: Function) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: formatError(err) });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Start background workers asynchronously (don't block server startup)
  // Wrap in try-catch to prevent server crash if workers fail
  setTimeout(() => {
    try {
      console.log('Starting background workers...');
      startRuleCheckerWorker();
    } catch (error) {
      console.error('Failed to start rule checker worker:', error);
    }
  }, 2000); // Wait 2 seconds for server to be fully ready
  
  setTimeout(() => {
    try {
      startDailyResetWorker();
    } catch (error) {
      console.error('Failed to start daily reset worker:', error);
    }
  }, 3000); // Wait 3 seconds for server to be fully ready
});

export default app;

