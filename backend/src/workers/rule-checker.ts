import { db } from '../database/connection';
import WebSocket from 'ws';
import { formatInTimeZone } from 'date-fns-tz';

const MT5_WS_URL = process.env.MT5_WS_URL || 'ws://188.213.198.109:5000';

interface WebSocketMessage {
  type: string;
  id: string;
  timestampUTC: number;
  data: {
    balance: number;
    credit: number;
    equity: number;
    margin: number;
    freeMargin: number;
    profit: number;
    marginLevel: number;
    user: number;
    orders?: any[];
  };
}

/**
 * Rule checker for a single account
 */
class AccountRuleChecker {
  private accountId: number;
  private hash: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(accountId: number, hash: string) {
    this.accountId = accountId;
    this.hash = hash;
  }

  async start(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const wsUrl = `${MT5_WS_URL}/OnOrderProfit?id=${this.hash}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log(`Rule checker connected for account ${this.accountId} (hash: ${this.hash.substring(0, 8)}...)`);
        this.reconnectAttempts = 0;
      });

      this.ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          await this.handleMessage(message);
        } catch (error) {
          console.error(`Error handling message for account ${this.accountId}:`, error);
        }
      });

      this.ws.on('error', (error) => {
        console.error(`WebSocket error for account ${this.accountId}:`, error);
      });

      this.ws.on('close', () => {
        console.log(`WebSocket closed for account ${this.accountId}, attempting reconnect...`);
        this.attemptReconnect();
      });
    } catch (error) {
      console.error(`Failed to connect WebSocket for account ${this.accountId}:`, error);
      this.attemptReconnect();
    }
  }

  private async handleMessage(message: WebSocketMessage): Promise<void> {
    if (message.type !== 'OrderProfit') {
      return;
    }

    const equity = message.data.equity;

    // Get account from database
    const account = await db('accounts')
      .where({ id: this.accountId })
      .first();

    if (!account || account.is_failed) {
      return;
    }

    // Check daily drawdown violation
    if (account.daily_dd_limit && equity <= account.daily_dd_limit) {
      const now = new Date();
      const brokerTimezone = process.env.BROKER_TIMEZONE || 'Europe/Istanbul';
      const dateStr = formatInTimeZone(now, brokerTimezone, 'yyyy-MM-dd');
      const timeStr = formatInTimeZone(now, brokerTimezone, 'HH:mm:ss');
      
      const failureReason = `حد مجاز ضرر روزانه در تاریخ ${dateStr} | ساعت ${timeStr} رد شد`;

      await db('accounts')
        .where({ id: this.accountId })
        .update({
          is_failed: true,
          failure_reason: failureReason,
          updated_at: new Date(),
        });

      console.log(`Account ${this.accountId} failed: Daily drawdown violation (equity: ${equity}, limit: ${account.daily_dd_limit})`);
      this.stop();
      return;
    }

    // Check all-time drawdown violation
    if (account.alltime_dd_limit && equity <= account.alltime_dd_limit) {
      const now = new Date();
      const brokerTimezone = process.env.BROKER_TIMEZONE || 'Europe/Istanbul';
      const dateStr = formatInTimeZone(now, brokerTimezone, 'yyyy-MM-dd');
      const timeStr = formatInTimeZone(now, brokerTimezone, 'HH:mm:ss');
      
      const failureReason = `حد مجاز ضرر کل در تاریخ ${dateStr} | ساعت ${timeStr} رد شد`;

      await db('accounts')
        .where({ id: this.accountId })
        .update({
          is_failed: true,
          failure_reason: failureReason,
          updated_at: new Date(),
        });

      console.log(`Account ${this.accountId} failed: All-time drawdown violation (equity: ${equity}, limit: ${account.alltime_dd_limit})`);
      this.stop();
      return;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`Max reconnection attempts reached for account ${this.accountId}`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);

    setTimeout(() => {
      console.log(`Reconnecting rule checker for account ${this.accountId} (attempt ${this.reconnectAttempts})...`);
      this.connect();
    }, delay);
  }

  stop(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Global map of active rule checkers
const ruleCheckers = new Map<number, AccountRuleChecker>();

/**
 * Start rule checker for an account
 */
export async function startRuleChecker(accountId: number): Promise<void> {
  const account = await db('accounts')
    .where({ id: accountId, is_connected: true, is_failed: false })
    .first();

  if (!account || !account.hash) {
    console.warn(`Cannot start rule checker for account ${accountId}: account not found or not connected`);
    return;
  }

  // Stop existing checker if any
  if (ruleCheckers.has(accountId)) {
    ruleCheckers.get(accountId)?.stop();
  }

  // Start new checker
  const checker = new AccountRuleChecker(accountId, account.hash);
  ruleCheckers.set(accountId, checker);
  await checker.start();
}

/**
 * Stop rule checker for an account
 */
export function stopRuleChecker(accountId: number): void {
  const checker = ruleCheckers.get(accountId);
  if (checker) {
    checker.stop();
    ruleCheckers.delete(accountId);
  }
}

/**
 * Initialize rule checkers for all connected accounts
 */
export async function initializeRuleCheckers(): Promise<void> {
  const accounts = await db('accounts')
    .where({ is_connected: true, is_failed: false })
    .whereNotNull('hash');

  console.log(`Initializing rule checkers for ${accounts.length} accounts...`);

  for (const account of accounts) {
    try {
      await startRuleChecker(account.id);
    } catch (error) {
      console.error(`Failed to start rule checker for account ${account.id}:`, error);
    }
  }
}

/**
 * Start rule checker worker
 */
export function startRuleCheckerWorker(): void {
  console.log('Starting rule checker worker...');

  // Initialize for existing accounts (async, don't block)
  initializeRuleCheckers().catch((error) => {
    console.error('Error initializing rule checkers:', error);
  });

  // Periodically check for new accounts that need rule checking
  setInterval(async () => {
    try {
      const accounts = await db('accounts')
        .where({ is_connected: true, is_failed: false })
        .whereNotNull('hash');

      for (const account of accounts) {
        if (!ruleCheckers.has(account.id)) {
          try {
            await startRuleChecker(account.id);
          } catch (error) {
            console.error(`Failed to start rule checker for account ${account.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error in rule checker interval:', error);
    }
  }, 60000); // Check every minute
}

// Start if run directly
if (require.main === module) {
  startRuleCheckerWorker();
}

