import { db } from './connection';
import * as migration001 from './migrations/001_create_plans';
import * as migration002 from './migrations/002_create_accounts';
import * as migration003 from './migrations/003_create_account_snapshots';
import * as migration004 from './migrations/004_create_equity_peaks';
import * as migration005 from './migrations/005_create_orders';
import * as migration006 from './migrations/006_create_account_metrics';

async function runMigrations() {
  try {
    console.log('Running migrations...');
    
    // Check if migrations table exists
    const hasMigrationsTable = await db.schema.hasTable('knex_migrations');
    if (!hasMigrationsTable) {
      await db.schema.createTable('knex_migrations', (table) => {
        table.increments('id').primary();
        table.string('name');
        table.integer('batch');
        table.timestamp('migration_time');
      });
    }
    
    // Run migrations in order
    await migration001.up(db);
    console.log('✓ Created plans table');
    
    await migration002.up(db);
    console.log('✓ Created accounts table');
    
    await migration003.up(db);
    console.log('✓ Created account_snapshots table');
    
    await migration004.up(db);
    console.log('✓ Created equity_peaks table');
    
    await migration005.up(db);
    console.log('✓ Created orders table');
    
    await migration006.up(db);
    console.log('✓ Created account_metrics table');
    
    console.log('All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();

