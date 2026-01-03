import { Router, Request, Response } from 'express';
import { db } from '../database/connection';
import { NotFoundError, ValidationError, formatError } from '../utils/errors';

const router = Router();

/**
 * POST /api/plans/sync
 * Sync plan from WordPress (create or update)
 * Body: { account_type, daily_dd_percent, max_dd_percent, daily_dd_is_floating, max_dd_is_floating }
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const { account_type, daily_dd_percent, max_dd_percent, daily_dd_is_floating, max_dd_is_floating } = req.body;

    if (!account_type || daily_dd_percent === undefined || max_dd_percent === undefined) {
      throw new ValidationError('Missing required fields: account_type, daily_dd_percent, max_dd_percent');
    }

    // Check if plan exists by account_type (name)
    const existing = await db('plans')
      .where({ name: account_type })
      .first();

    let plan;
    
    if (existing) {
      // Update existing plan
      await db('plans')
        .where({ id: existing.id })
        .update({
          daily_dd_percent,
          max_dd_percent,
          daily_dd_is_floating: daily_dd_is_floating || false,
          max_dd_is_floating: max_dd_is_floating || false,
          updated_at: new Date(),
        });
      
      // Fetch updated plan
      plan = await db('plans')
        .where({ id: existing.id })
        .first();
    } else {
      // Create new plan
      const [insertedId] = await db('plans')
        .insert({
          name: account_type,
          daily_dd_percent,
          max_dd_percent,
          daily_dd_is_floating: daily_dd_is_floating || false,
          max_dd_is_floating: max_dd_is_floating || false,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('id');
      
      // Fetch created plan
      plan = await db('plans')
        .where({ id: insertedId.id || insertedId })
        .first();
    }

    if (!plan) {
      throw new Error('Failed to create or update plan');
    }

    res.json({ plan });
  } catch (error: any) {
    console.error('Plan sync error:', error);
    if (error.code === '23505') {
      res.status(409).json({ error: { code: 'DUPLICATE_PLAN', message: 'Plan with this name already exists' } });
    } else {
      const errorMessage = error.message || String(error);
      res.status(400).json({ 
        error: { 
          code: 'SYNC_ERROR', 
          message: errorMessage,
          details: formatError(error)
        } 
      });
    }
  }
});

/**
 * GET /api/plans
 * List all plans
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const plans = await db('plans').select('*').orderBy('id');
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ error: formatError(error) });
  }
});

export default router;

