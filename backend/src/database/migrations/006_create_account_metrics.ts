import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('account_metrics', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('account_id').references('id').inTable('accounts').onDelete('CASCADE');
    table.timestamp('computed_at').defaultTo(knex.fn.now());
    
    // Balance (display only)
    table.decimal('initial_balance', 15, 2);
    table.decimal('current_balance', 15, 2);
    table.decimal('balance_change_percent', 10, 4);
    
    // Equity (for DD calculations)
    table.decimal('current_equity', 15, 2);
    table.decimal('starting_equity', 15, 2);
    table.decimal('daily_start_equity', 15, 2);
    
    // Baselines and peaks
    table.decimal('baseline_daily_equity', 15, 2);
    table.decimal('daily_peak_equity', 15, 2);
    table.decimal('baseline_max_equity', 15, 2);
    table.decimal('all_time_peak_equity', 15, 2);
    
    // Limits and breach points
    table.decimal('daily_limit_amount', 15, 2);
    table.decimal('daily_breach_equity', 15, 2);
    table.decimal('max_limit_amount', 15, 2);
    table.decimal('max_breach_equity', 15, 2);
    
    // Usage
    table.decimal('daily_used_amount', 15, 2);
    table.decimal('daily_usage_percent_of_limit', 10, 4);
    table.decimal('max_used_amount', 15, 2);
    table.decimal('max_usage_percent_of_limit', 10, 4);
    
    // Trading stats
    table.decimal('win_rate', 5, 2);
    table.decimal('loss_rate', 5, 2);
    table.decimal('profit_factor', 10, 4);
    table.decimal('best_trade', 15, 2);
    table.decimal('worst_trade', 15, 2);
    table.decimal('gross_profit', 15, 2);
    table.decimal('gross_loss', 15, 2);
    table.integer('trading_days');
    table.decimal('total_lots', 10, 2);
    table.integer('trades_count');
    
    table.unique(['account_id', 'computed_at']);
    table.index('account_id');
    table.index('computed_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('account_metrics');
}

