import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if column already exists
  const hasColumn = await knex.schema.hasColumn('accounts', 'last_orders_fetched_at');
  
  if (!hasColumn) {
    await knex.schema.alterTable('accounts', (table) => {
      table.timestamp('last_orders_fetched_at');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('accounts', 'last_orders_fetched_at');
  
  if (hasColumn) {
    await knex.schema.alterTable('accounts', (table) => {
      table.dropColumn('last_orders_fetched_at');
    });
  }
}

