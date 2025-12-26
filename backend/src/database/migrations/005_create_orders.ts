import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('orders', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('account_id').references('id').inTable('accounts').onDelete('CASCADE');
    table.bigInteger('order_id').notNullable();
    table.string('symbol', 20);
    table.string('type', 20); // buy, sell, balance, credit, etc.
    table.decimal('volume', 10, 2);
    table.decimal('price_open', 15, 5);
    table.decimal('price_close', 15, 5);
    table.decimal('profit', 15, 2);
    table.decimal('swap', 15, 2);
    table.decimal('commission', 15, 2);
    table.timestamp('time_open').notNullable();
    table.timestamp('time_close');
    table.boolean('is_demo_deposit').defaultTo(false);
    table.bigInteger('plan_id').references('id').inTable('plans').onDelete('SET NULL');
    table.string('account_type', 255);
    table.jsonb('raw_data');
    table.timestamp('fetched_at').defaultTo(knex.fn.now());
    
    table.unique(['account_id', 'order_id']);
    table.index(['account_id', 'time_open'], { orderBy: { time_open: 'desc' } });
    table.index('account_id');
    table.index('plan_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('orders');
}

