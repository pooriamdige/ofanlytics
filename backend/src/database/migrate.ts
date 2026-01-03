import { db } from './connection';
import * as migration001 from './migrations/001_create_plans';
import * as migration002 from './migrations/002_create_accounts';
import * as migration003 from './migrations/003_create_account_snapshots';
import * as migration004 from './migrations/004_create_equity_peaks';
import * as migration005 from './migrations/005_create_orders';
import * as migration006 from './migrations/006_create_account_metrics';
import * as migration007 from './migrations/007_add_last_orders_fetched_at';
import * as migration008 from './migrations/008_restructure_accounts';

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
    
    // Run migrations in order (check if table exists first)
    if (!(await db.schema.hasTable('plans'))) {
      await migration001.up(db);
      console.log('✓ Created plans table');
    } else {
      console.log('✓ plans table already exists, skipping');
    }
    
    if (!(await db.schema.hasTable('accounts'))) {
      await migration002.up(db);
      console.log('✓ Created accounts table');
    } else {
      console.log('✓ accounts table already exists, skipping');
    }
    
    if (!(await db.schema.hasTable('account_snapshots'))) {
      await migration003.up(db);
      console.log('✓ Created account_snapshots table');
    } else {
      console.log('✓ account_snapshots table already exists, skipping');
    }
    
    if (!(await db.schema.hasTable('equity_peaks'))) {
      await migration004.up(db);
      console.log('✓ Created equity_peaks table');
    } else {
      console.log('✓ equity_peaks table already exists, skipping');
    }
    
    if (!(await db.schema.hasTable('orders'))) {
      await migration005.up(db);
      console.log('✓ Created orders table');
    } else {
      console.log('✓ orders table already exists, skipping');
    }
    
    if (!(await db.schema.hasTable('account_metrics'))) {
      await migration006.up(db);
      console.log('✓ Created account_metrics table');
    } else {
      console.log('✓ account_metrics table already exists, skipping');
    }
    
    // Migration 007 adds a column, check if it exists
    const hasLastOrdersFetchedAt = await db.schema.hasColumn('accounts', 'last_orders_fetched_at');
    if (!hasLastOrdersFetchedAt) {
      await migration007.up(db);
      console.log('✓ Added last_orders_fetched_at to accounts table');
    } else {
      console.log('✓ last_orders_fetched_at column already exists, skipping');
    }
    
    // Migration 008 restructures accounts table
    const hasIsConnected = await db.schema.hasColumn('accounts', 'is_connected');
    if (!hasIsConnected) {
      await migration008.up(db);
      console.log('✓ Restructured accounts table (migration 008)');
    } else {
      console.log('✓ accounts table already restructured, skipping migration 008');
    }
    
    console.log('All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();

