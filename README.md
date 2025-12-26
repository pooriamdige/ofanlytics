# OneFunders Analytics

WordPress plugin + backend service for MT5 trading account analytics with real-time drawdown monitoring.

## Architecture

- **WordPress Plugin**: Admin UI and frontend dashboard
- **Backend Service**: REST API, MTAPI integration, workers (polling, live monitoring, cleanup)
- **Database**: PostgreSQL for backend, WordPress custom tables for plugin

## Quick Start

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database and MTAPI settings
npm run migrate
npm run dev
```

### WordPress Plugin

1. Copy `plugin/` directory to `wp-content/plugins/onefunders-analytics/`
2. Activate plugin in WordPress admin
3. Configure backend API URL in plugin settings

## Documentation

See the technical plan in `.cursor/plans/` for complete specifications.

