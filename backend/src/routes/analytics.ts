import { Router, Request, Response } from 'express';
import { db } from '../database/connection';
import { NotFoundError, formatError } from '../utils/errors';
import { checkAccountOwnership } from './accounts';
import { getNextResetTime, getSecondsUntilReset } from '../utils/timezone';
import { getTehranDateString } from '../utils/timezone';

const router = Router();

/**
 * GET /api/accounts/:id/analytics
 * Get analytics for account
 */
router.get('/:id/analytics', checkAccountOwnership, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get latest metrics
    const metrics = await db('account_metrics')
      .where({ account_id: id })
      .orderBy('computed_at', 'desc')
      .first();

    if (!metrics) {
      throw new NotFoundError('Metrics', `for account ${id}`);
    }

    // Get account monitoring state
    const account = await db('accounts').where({ id }).first();
    if (!account) {
      throw new NotFoundError('Account', id);
    }

    // Calculate next reset time
    const nextReset = getNextResetTime();
    const secondsUntilReset = getSecondsUntilReset();

    res.json({
      account_id: parseInt(id),
      computed_at: metrics.computed_at,
      metrics: {
        initial_balance: parseFloat(metrics.initial_balance?.toString() || '0'),
        current_balance: parseFloat(metrics.current_balance?.toString() || '0'),
        current_equity: parseFloat(metrics.current_equity?.toString() || '0'),
        balance_change_percent: parseFloat(metrics.balance_change_percent?.toString() || '0'),
        starting_equity: parseFloat(metrics.starting_equity?.toString() || '0'),
        daily_start_equity: parseFloat(metrics.daily_start_equity?.toString() || '0'),
        baseline_daily_equity: parseFloat(metrics.baseline_daily_equity?.toString() || '0'),
        daily_peak_equity: parseFloat(metrics.daily_peak_equity?.toString() || '0'),
        baseline_max_equity: parseFloat(metrics.baseline_max_equity?.toString() || '0'),
        all_time_peak_equity: parseFloat(metrics.all_time_peak_equity?.toString() || '0'),
        daily_limit_amount: parseFloat(metrics.daily_limit_amount?.toString() || '0'),
        daily_breach_equity: parseFloat(metrics.daily_breach_equity?.toString() || '0'),
        daily_used_amount: parseFloat(metrics.daily_used_amount?.toString() || '0'),
        daily_usage_percent_of_limit: parseFloat(metrics.daily_usage_percent_of_limit?.toString() || '0'),
        max_limit_amount: parseFloat(metrics.max_limit_amount?.toString() || '0'),
        max_breach_equity: parseFloat(metrics.max_breach_equity?.toString() || '0'),
        max_used_amount: parseFloat(metrics.max_used_amount?.toString() || '0'),
        max_usage_percent_of_limit: parseFloat(metrics.max_usage_percent_of_limit?.toString() || '0'),
        win_rate: parseFloat(metrics.win_rate?.toString() || '0'),
        loss_rate: parseFloat(metrics.loss_rate?.toString() || '0'),
        profit_factor: metrics.profit_factor ? parseFloat(metrics.profit_factor.toString()) : null,
        best_trade: parseFloat(metrics.best_trade?.toString() || '0'),
        worst_trade: parseFloat(metrics.worst_trade?.toString() || '0'),
        gross_profit: parseFloat(metrics.gross_profit?.toString() || '0'),
        gross_loss: parseFloat(metrics.gross_loss?.toString() || '0'),
        trading_days: metrics.trading_days || 0,
        total_lots: parseFloat(metrics.total_lots?.toString() || '0'),
        trades_count: metrics.trades_count || 0,
      },
      daily_reset: {
        next_reset: nextReset.toISOString(),
        seconds_until_reset: secondsUntilReset,
      },
      monitoring_state: account.monitoring_state,
    });
  } catch (error) {
    res.status(404).json({ error: formatError(error) });
  }
});

/**
 * GET /api/accounts/:id/orders
 * Get order history with pagination
 */
router.get('/:id/orders', checkAccountOwnership, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 50;
    const from = req.query.from as string;
    const to = req.query.to as string;

    let query = db('orders')
      .where({ account_id: id })
      .where('is_demo_deposit', false)
      .orderBy('time_open', 'desc');

    if (from) {
      query = query.where('time_open', '>=', from);
    }
    if (to) {
      query = query.where('time_open', '<=', to);
    }

    // Get total count
    const totalResult = await db('orders')
      .where({ account_id: id })
      .where('is_demo_deposit', false)
      .count('* as count')
      .first();
    
    const total = parseInt(totalResult?.count?.toString() || '0');
    const totalPages = Math.ceil(total / perPage);

    // Get paginated results
    const orders = await query
      .limit(perPage)
      .offset((page - 1) * perPage)
      .select(
        'order_id',
        'symbol',
        'type',
        'volume',
        'price_open',
        'price_close',
        'profit',
        'swap',
        'commission',
        'time_open',
        'time_close',
        'is_demo_deposit'
      );

    // Ensure orders is always an array
    const ordersArray = Array.isArray(orders) ? orders : [];

    res.json({
      orders: ordersArray,
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: totalPages,
      },
    });
  } catch (error) {
    res.status(500).json({ error: formatError(error) });
  }
});

/**
 * GET /api/accounts/:id/orders/export
 * Export orders as XLSX
 */
router.get('/:id/orders/export', checkAccountOwnership, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const format = req.query.format as string || 'xlsx';
    const from = req.query.from as string;
    const to = req.query.to as string;

    if (format !== 'xlsx') {
      return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Only xlsx format is supported' } });
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Orders');

    // Set headers
    worksheet.columns = [
      { header: 'Order ID', key: 'order_id', width: 15 },
      { header: 'Symbol', key: 'symbol', width: 15 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Volume', key: 'volume', width: 12 },
      { header: 'Price Open', key: 'price_open', width: 15 },
      { header: 'Price Close', key: 'price_close', width: 15 },
      { header: 'Profit', key: 'profit', width: 15 },
      { header: 'Swap', key: 'swap', width: 12 },
      { header: 'Commission', key: 'commission', width: 12 },
      { header: 'Time Open', key: 'time_open', width: 20 },
      { header: 'Time Close', key: 'time_close', width: 20 },
    ];

    let query = db('orders')
      .where({ account_id: id })
      .where('is_demo_deposit', false)
      .orderBy('time_open', 'desc');

    if (from) {
      query = query.where('time_open', '>=', from);
    }
    if (to) {
      query = query.where('time_open', '<=', to);
    }

    const orders = await query.select('*');

    // Add rows
    orders.forEach((order: any) => {
      worksheet.addRow({
        order_id: order.order_id,
        symbol: order.symbol,
        type: order.type,
        volume: order.volume,
        price_open: order.price_open,
        price_close: order.price_close,
        profit: order.profit,
        swap: order.swap,
        commission: order.commission,
        time_open: order.time_open,
        time_close: order.time_close,
      });
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=orders_${id}_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ error: formatError(error) });
  }
});

export default router;

