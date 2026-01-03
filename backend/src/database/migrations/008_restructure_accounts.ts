import { Knex } from 'knex';

/**
 * Restructure accounts table - remove unnecessary fields, keep only essentials
 * This migration modifies the existing accounts table to match new requirements
 */
export async function up(knex: Knex): Promise<void> {
  // Drop columns we no longer need
  await knex.schema.alterTable('accounts', (table) => {
    table.dropColumn('investor_password_encrypted');
    table.dropColumn('connection_state');
    table.dropColumn('monitoring_state');
    table.dropColumn('starting_equity');
    table.dropColumn('last_seen');
    table.dropColumn('session_id');
    table.dropColumn('session_expires_at');
    table.dropColumn('session_last_validated');
    table.dropColumn('ws_connection_id');
    table.dropColumn('ws_subscribed_at');
  });

  // Add new columns
  await knex.schema.alterTable('accounts', (table) => {
    table.string('hash', 100).unique(); // Session hash from MT5 API
    table.decimal('initial_balance', 15, 2); // Sum of demo deposits
    table.decimal('daily_dd_limit', 15, 2); // Daily drawdown limit
    table.decimal('alltime_dd_limit', 15, 2); // All-time drawdown limit
    table.decimal('daily_balance', 15, 2); // Balance at start of day (01:30 Tehran)
    table.timestamp('connected_at'); // When account was connected
    table.text('connection_error'); // Error message if connection failed
    table.boolean('is_connected').defaultTo(false); // Connection status
  });
}

export async function down(knex: Knex): Promise<void> {
  // Restore original columns (simplified - would need full original schema)
  await knex.schema.alterTable('accounts', (table) => {
    table.text('investor_password_encrypted');
    table.string('connection_state', 20).defaultTo('disconnected');
    table.string('monitoring_state', 20).defaultTo('normal');
    table.decimal('starting_equity', 15, 2);
    table.timestamp('last_seen');
    table.uuid('session_id');
    table.timestamp('session_expires_at');
    table.timestamp('session_last_validated');
    table.string('ws_connection_id', 100);
    table.timestamp('ws_subscribed_at');
  });

  // Remove new columns
  await knex.schema.alterTable('accounts', (table) => {
    table.dropColumn('hash');
    table.dropColumn('initial_balance');
    table.dropColumn('daily_dd_limit');
    table.dropColumn('alltime_dd_limit');
    table.dropColumn('daily_balance');
    table.dropColumn('connected_at');
    table.dropColumn('connection_error');
    table.dropColumn('is_connected');
  });
}

