import { db } from '../database/connection';
import { MT5APIClient } from '../services/mt5-api';
import { getNextResetTime, getSecondsUntilReset } from '../utils/timezone';

const MT5_API_URL = process.env.MT5_API_URL || 'http://188.213.198.109:5000';
const mt5Client = new MT5APIClient(MT5_API_URL);

/**
 * Daily reset worker - runs at 01:30 Tehran time
 * Updates daily_balance and recalculates daily_dd_limit for all accounts
 */
async function performDailyReset(): Promise<void> {
  try {
    console.log('Starting daily reset...');

    // Get all connected accounts
    const accounts = await db('accounts')
      .where({ is_connected: true, is_failed: false })
      .whereNotNull('hash');

    console.log(`Processing ${accounts.length} accounts for daily reset...`);

    for (const account of accounts) {
      try {
        // Get current balance from MT5 API
        let currentBalance = account.daily_balance || account.initial_balance || 0;
        
        try {
          const summary = await mt5Client.accountSummary(account.hash);
          currentBalance = summary.balance;
        } catch (error: any) {
          console.warn(`Failed to get balance for account ${account.id}, using stored value:`, error.message);
        }

        // Get plan to recalculate daily DD limit
        let plan = null;
        if (account.plan_id) {
          plan = await db('plans').where({ id: account.plan_id }).first();
        }

        let newDailyDdLimit = account.daily_dd_limit;

        if (plan && currentBalance > 0) {
          // Recalculate daily DD limit based on current balance
          // Daily DD limit = current_balance * (1 - daily_dd_percent / 100)
          newDailyDdLimit = currentBalance * (1 - parseFloat(plan.daily_dd_percent.toString()) / 100);
        }

        // Update account
        await db('accounts')
          .where({ id: account.id })
          .update({
            daily_balance: currentBalance,
            daily_dd_limit: newDailyDdLimit,
            updated_at: new Date(),
          });

        console.log(`Account ${account.id}: Updated daily_balance=${currentBalance}, daily_dd_limit=${newDailyDdLimit}`);
      } catch (error: any) {
        console.error(`Error processing account ${account.id} for daily reset:`, error.message);
      }
    }

    console.log('Daily reset completed');
  } catch (error) {
    console.error('Daily reset error:', error);
  }
}

/**
 * Calculate next reset time and schedule
 */
function scheduleNextReset(): void {
  const nextReset = getNextResetTime();
  const secondsUntilReset = getSecondsUntilReset();
  const msUntilReset = secondsUntilReset * 1000;

  console.log(`Next daily reset scheduled for: ${nextReset.toISOString()} (in ${Math.floor(secondsUntilReset / 60)} minutes)`);

  setTimeout(() => {
    performDailyReset().then(() => {
      // Schedule next reset (24 hours later)
      scheduleNextReset();
    });
  }, msUntilReset);
}

/**
 * Start daily reset worker
 */
export function startDailyResetWorker(): void {
  console.log('Starting daily reset worker...');

  try {
    // Perform initial reset if needed (check if we're past reset time today)
    const now = new Date();
    const nextReset = getNextResetTime();
    
    // If next reset is more than 23 hours away, we just passed reset time, so run it now
    const hoursUntilReset = (nextReset.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilReset > 23) {
      console.log('Reset time has passed today, performing reset now...');
      performDailyReset().then(() => {
        scheduleNextReset();
      }).catch((error) => {
        console.error('Error performing daily reset:', error);
        scheduleNextReset(); // Still schedule next reset even if this one failed
      });
    } else {
      scheduleNextReset();
    }
  } catch (error) {
    console.error('Error starting daily reset worker:', error);
  }
}

// Start if run directly
if (require.main === module) {
  startDailyResetWorker();
}

export { performDailyReset };

