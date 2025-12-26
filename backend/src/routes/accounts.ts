import { Router, Request, Response } from 'express';
import { db } from '../database/connection';
import { encrypt } from '../utils/encryption';
import { NotFoundError, ValidationError, UnauthorizedError, formatError } from '../utils/errors';

const router = Router();

/**
 * GET /api/accounts?wp_user_id=:id
 * List accounts for WP user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const wpUserId = req.query.wp_user_id;
    
    if (!wpUserId) {
      throw new ValidationError('wp_user_id query parameter is required');
    }

    const accounts = await db('accounts')
      .leftJoin('plans', 'accounts.plan_id', 'plans.id')
      .where({ 'accounts.wp_user_id': wpUserId })
      .select(
        'accounts.id',
        'accounts.wp_user_id',
        'accounts.login',
        'accounts.server',
        'accounts.plan_id',
        'plans.name as plan_name',
        'accounts.is_failed',
        'accounts.failure_reason',
        'accounts.connection_state',
        'accounts.monitoring_state',
        'accounts.last_seen',
        'accounts.created_at'
      );

    res.json({ accounts });
  } catch (error) {
    res.status(400).json({ error: formatError(error) });
  }
});

/**
 * POST /api/accounts
 * Create account
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { wp_user_id, login, server, investor_password, plan_id } = req.body;

    if (!wp_user_id || !login || !server || !investor_password) {
      throw new ValidationError('Missing required fields: wp_user_id, login, server, investor_password');
    }

    // Encrypt password
    const encryptedPassword = encrypt(investor_password);

    const [account] = await db('accounts')
      .insert({
        wp_user_id,
        login,
        server,
        investor_password_encrypted: encryptedPassword,
        plan_id: plan_id || null,
        connection_state: 'disconnected',
        monitoring_state: 'normal',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning(['id', 'wp_user_id', 'login', 'server', 'plan_id', 'is_failed', 'connection_state', 'monitoring_state', 'created_at']);

    res.status(201).json({ account });
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      res.status(409).json({ error: { code: 'DUPLICATE_ACCOUNT', message: 'Account with this login and server already exists' } });
    } else {
      res.status(400).json({ error: formatError(error) });
    }
  }
});

/**
 * PUT /api/accounts/:id
 * Update account
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_failed, failure_reason, plan_id } = req.body;

    const existing = await db('accounts').where({ id }).first();
    if (!existing) {
      throw new NotFoundError('Account', id);
    }

    const updates: any = { updated_at: new Date() };
    if (is_failed !== undefined) updates.is_failed = is_failed;
    if (failure_reason !== undefined) updates.failure_reason = failure_reason;
    if (plan_id !== undefined) updates.plan_id = plan_id;

    await db('accounts').where({ id }).update(updates);

    const account = await db('accounts')
      .leftJoin('plans', 'accounts.plan_id', 'plans.id')
      .where({ 'accounts.id': id })
      .select(
        'accounts.id',
        'accounts.wp_user_id',
        'accounts.login',
        'accounts.server',
        'accounts.plan_id',
        'plans.name as plan_name',
        'accounts.is_failed',
        'accounts.failure_reason',
        'accounts.connection_state',
        'accounts.monitoring_state',
        'accounts.last_seen',
        'accounts.created_at'
      )
      .first();

    res.json({ account });
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: formatError(error) });
    } else {
      res.status(400).json({ error: formatError(error) });
    }
  }
});

/**
 * Middleware to check account ownership
 */
async function checkAccountOwnership(req: Request, res: Response, next: Function) {
  try {
    const { id } = req.params;
    const wpUserId = req.query.wp_user_id || req.body.wp_user_id;

    if (!wpUserId) {
      throw new ValidationError('wp_user_id is required');
    }

    const account = await db('accounts').where({ id }).first();
    if (!account) {
      throw new NotFoundError('Account', id);
    }

    if (account.wp_user_id.toString() !== wpUserId.toString()) {
      throw new UnauthorizedError('User does not own this account');
    }

    next();
  } catch (error) {
    res.status(error instanceof UnauthorizedError ? 401 : 404).json({ error: formatError(error) });
  }
}

export default router;
export { checkAccountOwnership };

