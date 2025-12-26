import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('plans', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', 255).notNullable().unique();
    table.decimal('daily_dd_percent', 5, 2).notNullable();
    table.decimal('max_dd_percent', 5, 2).notNullable();
    table.boolean('daily_dd_is_floating').defaultTo(false);
    table.boolean('max_dd_is_floating').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('plans');
}

