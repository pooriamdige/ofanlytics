import { db } from '../database/connection';

const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const RETENTION_DAYS = 7;

/**
 * Purge data for failed accounts older than retention period
 */
async function cleanupFailedAccounts(): Promise<void> {
  try {
    console.log('Starting cleanup cycle...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    // Find failed accounts older than retention period
    const failedAccounts = await db('accounts')
      .where({ is_failed: true })
      .where('updated_at', '<', cutoffDate);

    console.log(`Found ${failedAccounts.length} failed accounts to purge...`);

    for (const account of failedAccounts) {
      const accountId = account.id;

      // Delete related data (CASCADE will handle most, but be explicit)
      await db('orders').where({ account_id: accountId }).delete();
      await db('account_metrics').where({ account_id: accountId }).delete();
      await db('account_snapshots').where({ account_id: accountId }).delete();
      await db('equity_peaks').where({ account_id: accountId }).delete();

      // Delete account
      await db('accounts').where({ id: accountId }).delete();

      console.log(`Purged data for account ${accountId}`);
    }

    console.log('Cleanup cycle completed');
  } catch (error) {
    console.error('Cleanup cycle error:', error);
  }
}

/**
 * Start cleanup worker
 */
function startCleanupWorker(): void {
  console.log('Starting cleanup worker...');
  console.log(`Cleanup interval: ${CLEANUP_INTERVAL / 1000 / 60} minutes`);
  console.log(`Retention period: ${RETENTION_DAYS} days`);

  // Run immediately
  cleanupFailedAccounts();

  // Then run on interval
  setInterval(cleanupFailedAccounts, CLEANUP_INTERVAL);
}

// Start if run directly
if (require.main === module) {
  startCleanupWorker();
}

export { startCleanupWorker };

