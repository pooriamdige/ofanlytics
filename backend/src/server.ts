import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import plansRouter from './routes/plans';
import accountsRouter from './routes/accounts';
import analyticsRouter from './routes/analytics';
import { testConnection } from './database/connection';
import { formatError } from './utils/errors';

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
app.use('/api/plans', plansRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/accounts', analyticsRouter);

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
});

export default app;

