# OneFunders Analytics Backend

Backend service for OneFunders Analytics platform.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and configure
3. Run migrations: `npm run migrate`
4. Start server: `npm run dev`

## Workers

- **Poll Worker**: `npm run worker:poll` - Normal polling every 3-5 minutes
- **Live Monitor**: `npm run worker:live` - Event-driven live monitoring
- **Cleanup Worker**: `npm run worker:cleanup` - Purge failed accounts after 7 days

## API Endpoints

- `GET /api/plans` - List all plans
- `POST /api/plans` - Create plan
- `PUT /api/plans/:id` - Update plan
- `DELETE /api/plans/:id` - Delete plan
- `GET /api/accounts?wp_user_id=:id` - List accounts
- `POST /api/accounts` - Create account
- `PUT /api/accounts/:id` - Update account
- `GET /api/accounts/:id/analytics` - Get analytics
- `GET /api/accounts/:id/orders` - Get order history
- `GET /api/accounts/:id/orders/export` - Export orders as XLSX

