import { db } from '../database/connection';
import { computeAndStoreMetrics } from '../services/metrics';
import {
  checkDailyViolation,
  checkMaxViolation,
  shouldExitLiveMonitoring,
} from '../utils/dd-calculator';
import { WebSocketManager } from './ws-manager';
import { formatInTimeZone } from 'date-fns-tz';

const MTAPI_EVENTS_URL = process.env.MTAPI_EVENTS_URL || 'http://185.8.173.37:5000';

const wsManager = new WebSocketManager(MTAPI_EVENTS_URL);

/**
 * Handle order profit event
 */
async function handleOrderProfit(accountId: number, _event: any): Promise<void> {
  try {
    // Recompute metrics immediately
    await computeAndStoreMetrics(accountId);

    // Get latest metrics
    const latestMetrics = await db('account_metrics')
      .where({ account_id: accountId })
      .orderBy('computed_at', 'desc')
      .first();

    if (!latestMetrics) return;

    const currentEquity = parseFloat(latestMetrics.current_equity?.toString() || '0');
    const dailyBreachEquity = parseFloat(latestMetrics.daily_breach_equity?.toString() || '0');
    const maxBreachEquity = parseFloat(latestMetrics.max_breach_equity?.toString() || '0');

    // Check violations
    const dailyViolation = checkDailyViolation(currentEquity, dailyBreachEquity);
    const maxViolation = checkMaxViolation(currentEquity, maxBreachEquity);

    if (dailyViolation || maxViolation) {
      // Format failure reason in Persian with date/time
      const now = new Date();
      const brokerTimezone = process.env.BROKER_TIMEZONE || 'Europe/Istanbul';
      const dateStr = formatInTimeZone(now, brokerTimezone, 'yyyy-MM-dd');
      const timeStr = formatInTimeZone(now, brokerTimezone, 'HH:mm:ss');
      
      const failureReason = dailyViolation 
        ? `حد مجاز ضرر روزانه در تاریخ ${dateStr} | ساعت ${timeStr} رد شد`
        : `حد مجاز ضرر کل در تاریخ ${dateStr} | ساعت ${timeStr} رد شد`;
      
      // Mark account as failed immediately
      await db('accounts')
        .where({ id: accountId })
        .update({
          is_failed: true,
          failure_reason: failureReason,
          monitoring_state: 'normal',
        });

      // Unsubscribe from events
      wsManager.unsubscribe(accountId);

      console.log(`Account ${accountId} failed via live monitoring: ${dailyViolation ? 'Daily DD' : 'Max DD'}`);
      return;
    }

    // Check if should exit live monitoring
    const dailyUsage = parseFloat(latestMetrics.daily_usage_percent_of_limit?.toString() || '0');
    const maxUsage = parseFloat(latestMetrics.max_usage_percent_of_limit?.toString() || '0');

    if (shouldExitLiveMonitoring(dailyUsage, maxUsage)) {
      await db('accounts')
        .where({ id: accountId })
        .update({ monitoring_state: 'normal' });

      wsManager.unsubscribe(accountId);
      console.log(`Account ${accountId} exited live monitoring`);
    }

  } catch (error) {
    console.error(`Error handling order profit for account ${accountId}:`, error);
  }
}

/**
 * Handle equity update event
 */
async function handleEquityUpdate(accountId: number, event: any): Promise<void> {
  try {
    // Update current equity immediately
    await db('account_metrics')
      .where({ account_id: accountId })
      .orderBy('computed_at', 'desc')
      .limit(1)
      .update({
        current_equity: event.equity,
        computed_at: new Date(),
      });

    // Recompute all metrics
    await computeAndStoreMetrics(accountId);

    // Get latest metrics for violation check
    const latestMetrics = await db('account_metrics')
      .where({ account_id: accountId })
      .orderBy('computed_at', 'desc')
      .first();

    if (!latestMetrics) return;

    const currentEquity = parseFloat(latestMetrics.current_equity?.toString() || '0');
    const dailyBreachEquity = parseFloat(latestMetrics.daily_breach_equity?.toString() || '0');
    const maxBreachEquity = parseFloat(latestMetrics.max_breach_equity?.toString() || '0');

    // Check violations
    const dailyViolation = checkDailyViolation(currentEquity, dailyBreachEquity);
    const maxViolation = checkMaxViolation(currentEquity, maxBreachEquity);

    if (dailyViolation || maxViolation) {
      // Format failure reason in Persian with date/time
      const now = new Date();
      const brokerTimezone = process.env.BROKER_TIMEZONE || 'Europe/Istanbul';
      const dateStr = formatInTimeZone(now, brokerTimezone, 'yyyy-MM-dd');
      const timeStr = formatInTimeZone(now, brokerTimezone, 'HH:mm:ss');
      
      const failureReason = dailyViolation 
        ? `حد مجاز ضرر روزانه در تاریخ ${dateStr} | ساعت ${timeStr} رد شد`
        : `حد مجاز ضرر کل در تاریخ ${dateStr} | ساعت ${timeStr} رد شد`;
      
      // Mark account as failed immediately
      await db('accounts')
        .where({ id: accountId })
        .update({
          is_failed: true,
          failure_reason: failureReason,
          monitoring_state: 'normal',
        });

      // Unsubscribe from events
      wsManager.unsubscribe(accountId);

      console.log(`Account ${accountId} failed via live monitoring: ${dailyViolation ? 'Daily DD' : 'Max DD'}`);
      return;
    }

    // Check if should exit live monitoring
    const dailyUsage = parseFloat(latestMetrics.daily_usage_percent_of_limit?.toString() || '0');
    const maxUsage = parseFloat(latestMetrics.max_usage_percent_of_limit?.toString() || '0');

    if (shouldExitLiveMonitoring(dailyUsage, maxUsage)) {
      await db('accounts')
        .where({ id: accountId })
        .update({ monitoring_state: 'normal' });

      wsManager.unsubscribe(accountId);
      console.log(`Account ${accountId} exited live monitoring`);
    }

  } catch (error) {
    console.error(`Error handling equity update for account ${accountId}:`, error);
  }
}

/**
 * Initialize live monitoring for accounts in 'live' state
 */
async function initializeLiveMonitoring(): Promise<void> {
  const accounts = await db('accounts')
    .where({ is_failed: false, monitoring_state: 'live' });

  console.log(`Initializing live monitoring for ${accounts.length} accounts...`);

  for (const account of accounts) {
    try {
      await wsManager.subscribe(account.id, account.login, account.server, account.session_id || undefined);
    } catch (error) {
      console.error(`Failed to subscribe account ${account.id}:`, error);
    }
  }
}

/**
 * Start live monitor worker
 */
function startLiveMonitor(): void {
  console.log('Starting live monitor worker...');

  // Set up event handlers
  wsManager.on('orderProfit', (data: { accountId: number; order_id: number; profit: number }) => {
    handleOrderProfit(data.accountId, data);
  });

  wsManager.on('equityUpdate', (data: { accountId: number; equity: number }) => {
    handleEquityUpdate(data.accountId, data);
  });

  wsManager.on('error', (data: { accountId: number; error: Error }) => {
    console.error(`WebSocket error for account ${data.accountId}:`, data.error);
  });

  // Initialize monitoring for existing live accounts
  initializeLiveMonitoring();

  // Periodically check for new accounts that need live monitoring
  setInterval(async () => {
    const accounts = await db('accounts')
      .where({ is_failed: false, monitoring_state: 'live' });

    for (const account of accounts) {
      if (!wsManager.isSubscribed(account.id)) {
        try {
          await wsManager.subscribe(account.id, account.login, account.server, account.session_id || undefined);
        } catch (error) {
          console.error(`Failed to subscribe account ${account.id}:`, error);
        }
      }
    }
  }, 60000); // Check every minute
}

// Start if run directly
if (require.main === module) {
  startLiveMonitor();
}

export { startLiveMonitor };

