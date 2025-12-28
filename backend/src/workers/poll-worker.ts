import { db } from '../database/connection';
import { MTAPIClient } from '../services/mtapi';
import { computeAndStoreMetrics, getDailyStartEquity } from '../services/metrics';
import { updateEquityPeak } from '../services/metrics';
import {
  calculateDrawdownMetrics,
  shouldEnterLiveMonitoring,
  shouldExitLiveMonitoring,
  checkDailyViolation,
  checkMaxViolation,
} from '../utils/dd-calculator';
import { isResetWindow, getTehranDateString } from '../utils/timezone';
import { zonedTimeToUtc } from 'date-fns-tz';
import { decrypt } from '../utils/encryption';
import { WebSocketManager } from './ws-manager';

const POLL_INTERVAL = 4 * 60 * 1000; // 4 minutes
const MTAPI_BASE_URL = process.env.MTAPI_BASE_URL || '';
const MTAPI_EVENTS_URL = process.env.MTAPI_EVENTS_URL || 'http://185.8.173.37:5000';

const mtapiClient = new MTAPIClient(MTAPI_BASE_URL);
const wsManager = new WebSocketManager(MTAPI_EVENTS_URL);

/**
 * Check session health
 */
function isSessionValid(account: any): boolean {
  if (!account.session_id) return false;
  if (!account.session_expires_at) return false;
  if (new Date(account.session_expires_at) < new Date()) return false;
  if (!account.session_last_validated) return false;
  
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if (new Date(account.session_last_validated) < oneHourAgo) return false;
  
  return true;
}

/**
 * Process a single account
 */
async function processAccount(account: any): Promise<void> {
  try {
    let summary: any;
    
    // Check session health
    if (!isSessionValid(account)) {
      console.log(`Reconnecting account ${account.id} (login: ${account.login}, server: ${account.server})...`);
      const password = decrypt(account.investor_password_encrypted);
      
      let sessionId: string;
      try {
        sessionId = await mtapiClient.withRetry(
          () => mtapiClient.connectEx(account.login, password, account.server),
          3,
          1000
        );
        
        if (!sessionId || sessionId.trim() === '') {
          throw new Error('ConnectEx returned empty session_id');
        }
        
        console.log(`Account ${account.id} connected, session_id: ${sessionId.substring(0, 8)}...`);
      } catch (error: any) {
        console.error(`Failed to connect account ${account.id}:`, error.message);
        await db('accounts')
          .where({ id: account.id })
          .update({
            connection_state: 'error',
            session_id: null,
            session_expires_at: null,
          });
        throw error;
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Get account summary immediately to capture starting_equity if not set
      summary = await mtapiClient.withRetry(
        () => mtapiClient.accountSummary(sessionId),
        2,
        1000
      );

      // Capture starting_equity on first connection
      const updates: any = {
        session_id: sessionId,
        session_expires_at: expiresAt,
        session_last_validated: new Date(),
        connection_state: 'connected',
      };

      if (!account.starting_equity && summary.equity) {
        updates.starting_equity = summary.equity;
      }

      await db('accounts')
        .where({ id: account.id })
        .update(updates);

      account.session_id = sessionId;
      account.starting_equity = updates.starting_equity || account.starting_equity;
    } else {
      // Get account summary
      summary = await mtapiClient.withRetry(
        () => mtapiClient.accountSummary(account.session_id),
        2,
        1000
      );
    }

    // Update last seen and session validation
    await db('accounts')
      .where({ id: account.id })
      .update({
        last_seen: new Date(),
        session_last_validated: new Date(),
      });

    // Determine date range for order history
    // Strategy: Use latest order time from database (most reliable)
    // If no orders exist, use June 1, 2025 in broker timezone
    let fromDate: Date;
    
    // Get the latest order time from database (most recent time_close or time_open)
    const latestOrder = await db('orders')
      .where({ account_id: account.id })
      .whereNotNull('time_close')
      .orderBy('time_close', 'desc')
      .first();
    
    if (latestOrder && latestOrder.time_close) {
      // Use latest order's close time as starting point
      // Add 1 second to avoid fetching the same order again
      fromDate = new Date(new Date(latestOrder.time_close).getTime() + 1000);
      console.log(`Account ${account.id}: Using latest order time: ${latestOrder.time_close}`);
    } else {
      // First time fetching orders - get from June 1, 2025 00:00:00 in broker timezone
      // Get broker timezone from MTAPI client (defaults to Europe/Istanbul UTC+2)
      const brokerTimezone = process.env.BROKER_TIMEZONE || 'Europe/Istanbul';
      
      // Create June 1, 2025 00:00:00 in broker timezone, convert to UTC Date object
      // This ensures when we format it for the API, it shows as June 1, 2025 00:00:00 in broker time
      const june1BrokerTime = '2025-06-01T00:00:00';
      const startOfJune2025UTC = zonedTimeToUtc(june1BrokerTime, brokerTimezone);
      
      const accountCreated = account.created_at ? new Date(account.created_at) : null;
      
      if (accountCreated && accountCreated > startOfJune2025UTC) {
        fromDate = accountCreated;
        console.log(`Account ${account.id}: First time fetch, using account creation date: ${fromDate.toISOString()}`);
      } else {
        fromDate = startOfJune2025UTC;
        console.log(`Account ${account.id}: First time fetch, using June 1, 2025 00:00:00 ${brokerTimezone}: ${fromDate.toISOString()}`);
      }
    }

    // Get order history (to date is current time)
    // Note: Dates will be converted to broker timezone inside orderHistory when sending to API
    const toDate = new Date();
    const orders = await mtapiClient.withRetry(
      () => mtapiClient.orderHistory(account.session_id, fromDate, toDate),
      2,
      1000
    );

    // Log in UTC for reference, but actual API calls use broker timezone
    console.log(`Account ${account.id}: Fetched ${orders.length} orders (UTC: ${fromDate.toISOString()} to ${toDate.toISOString()})`);

    // Process orders
    let ordersProcessed = 0;
    for (const order of orders) {
      // Demo deposit detection: orderType is "Balance" and comment contains "Demo deposit"
      const isDemoDeposit = order.type === 'Balance' && 
                           order.profit > 0 && 
                           order.comment?.toLowerCase().includes('demo deposit');

      // Extract raw MTAPI order data (stored in _raw field)
      const rawOrderData = (order as any)._raw || order;

      await db('orders')
        .insert({
          account_id: account.id,
          order_id: order.order_id,
          symbol: order.symbol,
          type: order.type,
          volume: order.volume,
          price_open: order.price_open,
          price_close: order.price_close,
          profit: order.profit,
          swap: order.swap,
          commission: order.commission,
          time_open: new Date(order.time_open),
          time_close: order.time_close ? new Date(order.time_close) : null,
          is_demo_deposit: isDemoDeposit,
          plan_id: account.plan_id,
          raw_data: rawOrderData, // Store original MTAPI order structure
        })
        .onConflict(['account_id', 'order_id'])
        .merge();
      
      ordersProcessed++;
    }

    // Update last_orders_fetched_at to current time (for reference, but we use latest order time for next fetch)
    await db('accounts')
      .where({ id: account.id })
      .update({
        last_orders_fetched_at: new Date(),
      });

    if (ordersProcessed > 0) {
      console.log(`Account ${account.id}: Processed ${ordersProcessed} orders`);
    }

    // Check for daily reset (01:30 Asia/Tehran)
    if (isResetWindow()) {
      const today = getTehranDateString();
      const existingSnapshot = await db('account_snapshots')
        .where({ account_id: account.id, snapshot_date: today })
        .first();

      if (!existingSnapshot) {
        await db('account_snapshots').insert({
          account_id: account.id,
          snapshot_date: today,
          equity: summary.equity,
          balance: summary.balance,
          snapshot_time: new Date(),
        });
      }
    }

    // Compute metrics
    await computeAndStoreMetrics(account.id);

    // Get latest metrics for violation check
    const latestMetrics = await db('account_metrics')
      .where({ account_id: account.id })
      .orderBy('computed_at', 'desc')
      .first();

    const plan = await db('plans').where({ id: account.plan_id }).first();

    // Check violations
    const dailyViolation = checkDailyViolation(
      parseFloat(latestMetrics.current_equity?.toString() || '0'),
      parseFloat(latestMetrics.daily_breach_equity?.toString() || '0')
    );

    const maxViolation = checkMaxViolation(
      parseFloat(latestMetrics.current_equity?.toString() || '0'),
      parseFloat(latestMetrics.max_breach_equity?.toString() || '0')
    );

    if (dailyViolation || maxViolation) {
      await db('accounts')
        .where({ id: account.id })
        .update({
          is_failed: true,
          failure_reason: dailyViolation ? 'Daily DD violation' : 'Max DD violation',
          monitoring_state: 'normal',
        });

      // Unsubscribe from live monitoring if active
      if (wsManager.isSubscribed(account.id)) {
        wsManager.unsubscribe(account.id);
      }

      console.log(`Account ${account.id} failed: ${dailyViolation ? 'Daily DD' : 'Max DD'} violation`);
      return;
    }

    // Check state transitions
    const dailyUsage = parseFloat(latestMetrics.daily_usage_percent_of_limit?.toString() || '0');
    const maxUsage = parseFloat(latestMetrics.max_usage_percent_of_limit?.toString() || '0');

    if (account.monitoring_state === 'normal') {
      if (shouldEnterLiveMonitoring(dailyUsage, maxUsage)) {
        await db('accounts')
          .where({ id: account.id })
          .update({ monitoring_state: 'live' });

        // Subscribe to WebSocket events
        await wsManager.subscribe(account.id, account.login, account.server, account.session_id);
        console.log(`Account ${account.id} entered live monitoring`);
      }
    } else if (account.monitoring_state === 'live') {
      if (shouldExitLiveMonitoring(dailyUsage, maxUsage)) {
        await db('accounts')
          .where({ id: account.id })
          .update({ monitoring_state: 'normal' });

        // Unsubscribe from WebSocket events
        wsManager.unsubscribe(account.id);
        console.log(`Account ${account.id} exited live monitoring`);
      }
    }

  } catch (error: any) {
    console.error(`Error processing account ${account.id}:`, error.message);
    
    // Mark connection as error if it's a session issue
    if (error.message?.includes('Session expired') || error.message?.includes('401') || error.message?.includes('403')) {
      await db('accounts')
        .where({ id: account.id })
        .update({
          connection_state: 'error',
          session_id: null,
        });
    }
  }
}

/**
 * Main poll loop
 */
async function pollLoop(): Promise<void> {
  try {
    console.log('Starting poll cycle...');

    // Get all active accounts
    const accounts = await db('accounts')
      .where({ is_failed: false })
      .whereIn('connection_state', ['connected', 'disconnected', 'error']);

    console.log(`Processing ${accounts.length} accounts...`);

    // Process accounts in parallel (with concurrency limit)
    const concurrency = 5;
    for (let i = 0; i < accounts.length; i += concurrency) {
      const batch = accounts.slice(i, i + concurrency);
      await Promise.all(batch.map(processAccount));
    }

    console.log('Poll cycle completed');
  } catch (error) {
    console.error('Poll cycle error:', error);
  }
}

/**
 * Start poll worker
 */
function startPollWorker(): void {
  console.log('Starting poll worker...');
  console.log(`Poll interval: ${POLL_INTERVAL / 1000} seconds`);

  // Run immediately
  pollLoop();

  // Then run on interval
  setInterval(pollLoop, POLL_INTERVAL);
}

// Start if run directly
if (require.main === module) {
  startPollWorker();
}

export { startPollWorker };

