import { db } from '../database/connection';
import { getTehranDateString } from '../utils/timezone';
import {
  calculateDrawdownMetrics,
  calculateDailyPeakEquity,
  calculateAllTimePeakEquity,
} from '../utils/dd-calculator';
import type { Plan } from '../utils/dd-calculator';

export interface TradingStats {
  win_rate: number;
  loss_rate: number;
  profit_factor: number | null;
  best_trade: number;
  worst_trade: number;
  gross_profit: number;
  gross_loss: number;
  trading_days: number;
  total_lots: number;
  trades_count: number;
}

/**
 * Calculate initial balance (sum of demo deposits)
 */
export async function calculateInitialBalance(accountId: number): Promise<number> {
  const result = await db('orders')
    .where({ account_id: accountId, is_demo_deposit: true })
    .where('profit', '>', 0)
    .sum('profit as total')
    .first();

  return parseFloat(result?.total?.toString() || '0');
}

/**
 * Calculate trading stats
 */
export async function calculateTradingStats(accountId: number): Promise<TradingStats> {
  // Get closed trades (exclude demo deposits)
  const closedTrades = await db('orders')
    .where({ account_id: accountId, is_demo_deposit: false })
    .whereIn('type', ['buy', 'sell'])
    .whereNotNull('time_close');

  const totalTrades = closedTrades.length;
  const winningTrades = closedTrades.filter(t => parseFloat(t.profit?.toString() || '0') > 0);
  const losingTrades = closedTrades.filter(t => parseFloat(t.profit?.toString() || '0') < 0);

  const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
  const lossRate = 100 - winRate;

  const grossProfit = winningTrades.reduce((sum, t) => sum + parseFloat(t.profit?.toString() || '0'), 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + parseFloat(t.profit?.toString() || '0'), 0));

  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  const profits = closedTrades.map(t => parseFloat(t.profit?.toString() || '0'));
  const bestTrade = profits.length > 0 ? Math.max(...profits) : 0;
  const worstTrade = profits.length > 0 ? Math.min(...profits) : 0;

  // Trading days - count distinct dates in Asia/Tehran timezone
  const tradingDaysResult = await db('orders')
    .where({ account_id: accountId, is_demo_deposit: false })
    .select(db.raw("COUNT(DISTINCT DATE(time_open AT TIME ZONE 'Asia/Tehran')) as days"))
    .first();

  const tradingDays = parseInt(tradingDaysResult?.days?.toString() || '0');

  // Total lots
  const lotsResult = await db('orders')
    .where({ account_id: accountId, is_demo_deposit: false })
    .sum('volume as total')
    .first();

  const totalLots = parseFloat(lotsResult?.total?.toString() || '0');

  // Trades count
  const tradesCount = await db('orders')
    .where({ account_id: accountId, is_demo_deposit: false })
    .whereIn('type', ['buy', 'sell'])
    .count('* as count')
    .first();

  return {
    win_rate: winRate,
    loss_rate: lossRate,
    profit_factor: profitFactor,
    best_trade: bestTrade,
    worst_trade: worstTrade,
    gross_profit: grossProfit,
    gross_loss: grossLoss,
    trading_days: tradingDays,
    total_lots: totalLots,
    trades_count: parseInt(tradesCount?.count?.toString() || '0'),
  };
}

/**
 * Get or create daily snapshot
 */
export async function getDailyStartEquity(accountId: number): Promise<number> {
  const today = getTehranDateString();
  
  const snapshot = await db('account_snapshots')
    .where({ account_id: accountId, snapshot_date: today })
    .first();

  if (snapshot) {
    return parseFloat(snapshot.equity?.toString() || '0');
  }

  // Get most recent snapshot before today
  const recentSnapshot = await db('account_snapshots')
    .where({ account_id: accountId })
    .where('snapshot_date', '<', today)
    .orderBy('snapshot_date', 'desc')
    .first();

  if (recentSnapshot) {
    return parseFloat(recentSnapshot.equity?.toString() || '0');
  }

  // Fallback to starting equity
  const account = await db('accounts').where({ id: accountId }).first();
  return parseFloat(account?.starting_equity?.toString() || '0');
}

/**
 * Get equity peaks
 */
export async function getEquityPeaks(accountId: number): Promise<{
  dailyPeak?: { equity: number; recorded_at: Date; trading_date?: string };
  allTimePeak?: { equity: number; recorded_at: Date };
}> {
  const today = getTehranDateString();

  const dailyPeak = await db('equity_peaks')
    .where({ account_id: accountId, peak_type: 'daily_peak', trading_date: today })
    .first();

  const allTimePeak = await db('equity_peaks')
    .where({ account_id: accountId, peak_type: 'all_time_peak' })
    .orderBy('equity', 'desc')
    .first();

  return {
    dailyPeak: dailyPeak ? {
      equity: parseFloat(dailyPeak.equity?.toString() || '0'),
      recorded_at: dailyPeak.recorded_at,
      trading_date: dailyPeak.trading_date,
    } : undefined,
    allTimePeak: allTimePeak ? {
      equity: parseFloat(allTimePeak.equity?.toString() || '0'),
      recorded_at: allTimePeak.recorded_at,
    } : undefined,
  };
}

/**
 * Update equity peak atomically
 */
export async function updateEquityPeak(
  accountId: number,
  peakType: 'daily_peak' | 'all_time_peak',
  equity: number,
  tradingDate?: string
): Promise<void> {
  if (peakType === 'daily_peak' && !tradingDate) {
    tradingDate = getTehranDateString();
  }

  // Use PostgreSQL UPSERT with MAX to prevent race conditions
  if (peakType === 'daily_peak') {
    await db.raw(`
      INSERT INTO equity_peaks (account_id, peak_type, equity, recorded_at, trading_date)
      VALUES (?, ?, ?, NOW(), ?)
      ON CONFLICT (account_id, peak_type, trading_date) 
      WHERE peak_type = 'daily_peak'
      DO UPDATE SET 
        equity = GREATEST(excluded.equity, equity_peaks.equity),
        recorded_at = CASE 
          WHEN excluded.equity > equity_peaks.equity THEN NOW()
          ELSE equity_peaks.recorded_at
        END
    `, [accountId, peakType, equity, tradingDate]);
  } else {
    await db.raw(`
      INSERT INTO equity_peaks (account_id, peak_type, equity, recorded_at)
      VALUES (?, ?, ?, NOW())
      ON CONFLICT (account_id, peak_type) 
      WHERE peak_type = 'all_time_peak'
      DO UPDATE SET 
        equity = GREATEST(excluded.equity, equity_peaks.equity),
        recorded_at = CASE 
          WHEN excluded.equity > equity_peaks.equity THEN NOW()
          ELSE equity_peaks.recorded_at
        END
    `, [accountId, peakType, equity]);
  }
}

/**
 * Compute and store all metrics for an account
 */
export async function computeAndStoreMetrics(accountId: number): Promise<void> {
  const account = await db('accounts').where({ id: accountId }).first();
  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  const plan = await db('plans').where({ id: account.plan_id }).first();
  if (!plan) {
    throw new Error(`Plan ${account.plan_id} not found`);
  }

  // Get latest equity/balance from metrics or account
  const latestMetrics = await db('account_metrics')
    .where({ account_id: accountId })
    .orderBy('computed_at', 'desc')
    .first();

  const currentEquity = parseFloat(latestMetrics?.current_equity?.toString() || account.starting_equity?.toString() || '0');
  const currentBalance = parseFloat(latestMetrics?.current_balance?.toString() || '0');
  const startingEquity = parseFloat(account.starting_equity?.toString() || '0');

  // Get initial balance
  const initialBalance = await calculateInitialBalance(accountId);

  // Get daily start equity
  const dailyStartEquity = await getDailyStartEquity(accountId);

  // Get equity peaks
  const { dailyPeak, allTimePeak } = await getEquityPeaks(accountId);

  // Calculate drawdown metrics
  const ddMetrics = calculateDrawdownMetrics(
    plan as Plan,
    currentEquity,
    startingEquity,
    dailyStartEquity,
    dailyPeak,
    allTimePeak
  );

  // Update peaks if needed
  if (currentEquity > ddMetrics.daily_peak_equity && plan.daily_dd_is_floating) {
    await updateEquityPeak(accountId, 'daily_peak', currentEquity);
  }

  if (currentEquity > ddMetrics.all_time_peak_equity && plan.max_dd_is_floating) {
    await updateEquityPeak(accountId, 'all_time_peak', currentEquity);
  }

  // Calculate trading stats
  const tradingStats = await calculateTradingStats(accountId);

  // Calculate balance change percent
  const balanceChangePercent = initialBalance > 0
    ? ((currentBalance - initialBalance) / initialBalance) * 100
    : 0;

  // Store metrics
  await db('account_metrics').insert({
    account_id: accountId,
    computed_at: new Date(),
    initial_balance: initialBalance,
    current_balance: currentBalance,
    current_equity: currentEquity,
    balance_change_percent: balanceChangePercent,
    starting_equity: startingEquity,
    daily_start_equity: dailyStartEquity,
    baseline_daily_equity: ddMetrics.baseline_daily_equity,
    daily_peak_equity: ddMetrics.daily_peak_equity,
    baseline_max_equity: ddMetrics.baseline_max_equity,
    all_time_peak_equity: ddMetrics.all_time_peak_equity,
    daily_limit_amount: ddMetrics.daily_limit_amount,
    daily_breach_equity: ddMetrics.daily_breach_equity,
    daily_used_amount: ddMetrics.daily_used_amount,
    daily_usage_percent_of_limit: ddMetrics.daily_usage_percent_of_limit,
    max_limit_amount: ddMetrics.max_limit_amount,
    max_breach_equity: ddMetrics.max_breach_equity,
    max_used_amount: ddMetrics.max_used_amount,
    max_usage_percent_of_limit: ddMetrics.max_usage_percent_of_limit,
    ...tradingStats,
  });
}

