import { Router, Request, Response } from 'express';
import { db } from '../database/connection';
import { MT5APIClient } from '../services/mt5-api';
import { NotFoundError, formatError } from '../utils/errors';
import { formatInTimeZone } from 'date-fns-tz';

const router = Router();

const MT5_API_URL = process.env.MT5_API_URL || 'http://188.213.198.109:5000';
const mt5Client = new MT5APIClient(MT5_API_URL);

/**
 * GET /api/analytics/:hash
 * Get real-time analytics for an account by hash
 * Returns: balance, order history, daily balance, initial balance, daily dd, alltime dd, failure status
 */
router.get('/:hash', async (req: Request, res: Response) => {
  try {
    const { hash } = req.params;

    // Get account from database
    const account = await db('accounts')
      .where({ hash })
      .first();

    if (!account) {
      throw new NotFoundError('Account', hash);
    }

    // Get current balance from MT5 API
    let accountSummary;
    try {
      accountSummary = await mt5Client.accountSummary(hash);
    } catch (error: any) {
      return res.status(400).json({
        error: {
          code: 'MT5_API_ERROR',
          message: `Failed to get account summary: ${error.message}`,
        },
      });
    }

    // Get order history from MT5 API
    const fromDate = '2025-06-01T00:00:00';
    const toDate = formatInTimeZone(new Date(), 'UTC', 'yyyy-MM-dd\'T\'HH:mm:ss');
    
    let orderHistory;
    try {
      orderHistory = await mt5Client.orderHistory(hash, fromDate, toDate);
    } catch (error: any) {
      return res.status(400).json({
        error: {
          code: 'MT5_API_ERROR',
          message: `Failed to get order history: ${error.message}`,
        },
      });
    }

    // Filter out demo deposits from order history
    const filteredOrders = (orderHistory.orders || []).filter(
      (order) => !(order.orderType === 'Balance' && order.comment?.toLowerCase().includes('demo deposit'))
    );

    // Calculate trading stats from filtered orders
    const closedTrades = filteredOrders.filter(
      (order) => order.orderType === 'Buy' || order.orderType === 'Sell'
    );

    const winningTrades = closedTrades.filter((t) => t.profit > 0);
    const losingTrades = closedTrades.filter((t) => t.profit < 0);

    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
    const lossRate = 100 - winRate;

    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

    const profits = closedTrades.map((t) => t.profit);
    const bestTrade = profits.length > 0 ? Math.max(...profits) : 0;
    const worstTrade = profits.length > 0 ? Math.min(...profits) : 0;

    const avgWinningTrade = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const avgLosingTrade = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;

    // Calculate total lots
    const totalLots = closedTrades.reduce((sum, t) => sum + (t.lots || 0), 0);

    // Calculate trading days (distinct dates)
    const tradingDates = new Set(
      closedTrades.map((t) => {
        const date = new Date(t.openTime);
        return date.toISOString().split('T')[0];
      })
    );
    const tradingDays = tradingDates.size;

    res.json({
      balance: accountSummary.balance,
      equity: accountSummary.equity,
      order_history: filteredOrders.map((order) => ({
        ticket: order.ticket,
        symbol: order.symbol,
        type: order.orderType,
        lots: order.lots,
        openPrice: order.openPrice,
        closePrice: order.closePrice,
        profit: order.profit,
        swap: order.swap,
        commission: order.commission,
        openTime: order.openTime,
        closeTime: order.closeTime,
        comment: order.comment,
      })),
      daily_balance: account.daily_balance,
      initial_balance: account.initial_balance,
      daily_dd_limit: account.daily_dd_limit,
      alltime_dd_limit: account.alltime_dd_limit,
      is_failed: account.is_failed,
      failure_reason: account.failure_reason,
      trading_stats: {
        win_rate: winRate,
        loss_rate: lossRate,
        profit_factor: profitFactor,
        best_trade: bestTrade,
        worst_trade: worstTrade,
        gross_profit: grossProfit,
        gross_loss: grossLoss,
        avg_winning_trade: avgWinningTrade,
        avg_losing_trade: avgLosingTrade,
        total_lots: totalLots,
        trading_days: tradingDays,
        trades_count: closedTrades.length,
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: formatError(error) });
    } else {
      res.status(500).json({ error: formatError(error) });
    }
  }
});

export default router;
