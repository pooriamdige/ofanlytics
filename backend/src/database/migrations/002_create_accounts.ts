import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('accounts', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('wp_user_id').notNullable();
    table.string('login', 50).notNullable();
    table.string('server', 100).notNullable();
    table.text('investor_password_encrypted').notNullable();
    table.bigInteger('plan_id').references('id').inTable('plans').onDelete('SET NULL');
    table.boolean('is_failed').defaultTo(false);
    table.text('failure_reason');
    table.string('connection_state', 20).defaultTo('disconnected');
    table.string('monitoring_state', 20).defaultTo('normal');
    table.decimal('starting_equity', 15, 2);
    table.timestamp('last_seen');
    table.uuid('session_id');
    table.timestamp('session_expires_at');
    table.timestamp('session_last_validated');
    table.string('ws_connection_id', 100);
    table.timestamp('ws_subscribed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.unique(['login', 'server']);
    table.index('wp_user_id');
    table.index('plan_id');
    table.index('connection_state');
    table.index('monitoring_state');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('accounts');
}

