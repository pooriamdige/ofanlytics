import { Router, Request, Response } from 'express';
import { db } from '../database/connection';
import { MT5APIClient } from '../services/mt5-api';
import { ValidationError, formatError } from '../utils/errors';
import { formatInTimeZone } from 'date-fns-tz';

const router = Router();

const MT5_API_URL = process.env.MT5_API_URL || 'http://188.213.198.109:5000';
const mt5Client = new MT5APIClient(MT5_API_URL);

/**
 * POST /api/accounts/connect
 * Connect account to MT5 API and store hash + initial balance + DD limits
 * Body: { wp_user_id, login, investor_password, server, plan_id }
 */
router.post('/connect', async (req: Request, res: Response) => {
  try {
    const { wp_user_id, login, investor_password, server, plan_id } = req.body;

    if (!wp_user_id || !login || !investor_password || !server) {
      throw new ValidationError('Missing required fields: wp_user_id, login, investor_password, server');
    }

    // Get plan to calculate DD limits
    let plan = null;
    if (plan_id) {
      plan = await db('plans').where({ id: plan_id }).first();
    }

    // Connect to MT5 API
    let hash: string;
    try {
      hash = await mt5Client.connectEx(login, investor_password, server);
    } catch (error: any) {
      return res.status(400).json({
        error: {
          code: 'CONNECTION_FAILED',
          message: error.message || 'Failed to connect to MT5 API',
        },
      });
    }

    // Get first 2 orders to find demo deposits
    const fromDate = '2025-01-01T00:00:00';
    const toDate = formatInTimeZone(new Date(), 'UTC', 'yyyy-MM-dd\'T\'HH:mm:ss');
    
    let initialBalance = 0;
    try {
      const orderHistory = await mt5Client.orderHistoryPagination(hash, fromDate, toDate, 2, 0);
      
      // Sum all demo deposits
      for (const order of orderHistory.orders || []) {
        if (order.orderType === 'Balance' && 
            order.comment?.toLowerCase().includes('demo deposit') &&
            order.profit > 0) {
          initialBalance += order.profit;
        }
      }
    } catch (error: any) {
      // If we can't get orders, still proceed but initialBalance will be 0
      console.warn(`Failed to get initial balance for account ${login}:`, error.message);
    }

    // Calculate DD limits based on plan
    let dailyDdLimit = 0;
    let alltimeDdLimit = 0;

    if (plan && initialBalance > 0) {
      // Daily DD limit = initial_balance * (1 - daily_dd_percent / 100)
      dailyDdLimit = initialBalance * (1 - parseFloat(plan.daily_dd_percent.toString()) / 100);
      
      // All-time DD limit = initial_balance * (1 - max_dd_percent / 100)
      alltimeDdLimit = initialBalance * (1 - parseFloat(plan.max_dd_percent.toString()) / 100);
    }

    // Check if account already exists
    const existing = await db('accounts')
      .where({ login, server })
      .first();

    let account;
    
    if (existing) {
      // Update existing account with new hash
      await db('accounts')
        .where({ id: existing.id })
        .update({
          hash,
          initial_balance: initialBalance,
          daily_dd_limit: dailyDdLimit,
          alltime_dd_limit: alltimeDdLimit,
          daily_balance: initialBalance, // Will be updated by daily reset worker
          is_connected: true,
          connected_at: new Date(),
          connection_error: null,
          plan_id: plan_id || null,
          updated_at: new Date(),
        });
      
      // Fetch updated account
      account = await db('accounts')
        .where({ id: existing.id })
        .first();
    } else {
      // Create new account
      const [insertedId] = await db('accounts')
        .insert({
          wp_user_id,
          login,
          server,
          hash,
          initial_balance: initialBalance,
          daily_dd_limit: dailyDdLimit,
          alltime_dd_limit: alltimeDdLimit,
          daily_balance: initialBalance,
          is_connected: true,
          connected_at: new Date(),
          is_failed: false,
          failure_reason: null,
          plan_id: plan_id || null,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('id');
      
      // Fetch created account
      account = await db('accounts')
        .where({ id: insertedId.id || insertedId })
        .first();
    }
    
    if (!account) {
      throw new Error('Failed to create or update account');
    }

    res.json({
      account: {
        id: account.id,
        hash: account.hash,
        initial_balance: account.initial_balance,
        daily_dd_limit: account.daily_dd_limit,
        alltime_dd_limit: account.alltime_dd_limit,
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: formatError(error) });
  }
});

export default router;

