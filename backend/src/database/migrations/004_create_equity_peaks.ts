import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('equity_peaks', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('account_id').references('id').inTable('accounts').onDelete('CASCADE');
    table.string('peak_type', 20).notNullable(); // 'daily_peak' or 'all_time_peak'
    table.decimal('equity', 15, 2).notNullable();
    table.timestamp('recorded_at').notNullable();
    table.date('trading_date'); // For daily_peak only
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Note: PostgreSQL partial unique indexes must be created separately
    // We'll create them via raw SQL after table creation
    
    table.index(['account_id', 'peak_type']);
    table.index(['account_id', 'peak_type', 'trading_date']);
  });
  
  // Create partial unique indexes for atomic UPSERT
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS equity_peaks_daily_unique 
    ON equity_peaks (account_id, peak_type, trading_date) 
    WHERE peak_type = 'daily_peak'
  `);
  
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS equity_peaks_all_time_unique 
    ON equity_peaks (account_id, peak_type) 
    WHERE peak_type = 'all_time_peak'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('equity_peaks');
}

