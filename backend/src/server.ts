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
app.get('/health', async (req: Request, res: Response) => {
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
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: formatError(err) });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Start background workers
  startRuleCheckerWorker();
  startDailyResetWorker();
});

export default app;

