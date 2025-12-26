import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('account_snapshots', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('account_id').references('id').inTable('accounts').onDelete('CASCADE');
    table.date('snapshot_date').notNullable();
    table.decimal('equity', 15, 2).notNullable();
    table.decimal('balance', 15, 2).notNullable();
    table.timestamp('snapshot_time').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.unique(['account_id', 'snapshot_date']);
    table.index('account_id');
    table.index('snapshot_date');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('account_snapshots');
}

