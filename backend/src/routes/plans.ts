import { Router, Request, Response } from 'express';
import { db } from '../database/connection';
import { NotFoundError, ValidationError, formatError } from '../utils/errors';

const router = Router();

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

/**
 * POST /api/plans
 * Create plan
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, daily_dd_percent, max_dd_percent, daily_dd_is_floating, max_dd_is_floating } = req.body;

    if (!name || daily_dd_percent === undefined || max_dd_percent === undefined) {
      throw new ValidationError('Missing required fields: name, daily_dd_percent, max_dd_percent');
    }

    const [plan] = await db('plans')
      .insert({
        name,
        daily_dd_percent,
        max_dd_percent,
        daily_dd_is_floating: daily_dd_is_floating || false,
        max_dd_is_floating: max_dd_is_floating || false,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    res.status(201).json({ plan });
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      res.status(409).json({ error: { code: 'DUPLICATE_PLAN', message: 'Plan with this name already exists' } });
    } else {
      res.status(400).json({ error: formatError(error) });
    }
  }
});

/**
 * PUT /api/plans/:id
 * Update plan
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, daily_dd_percent, max_dd_percent, daily_dd_is_floating, max_dd_is_floating } = req.body;

    const existing = await db('plans').where({ id }).first();
    if (!existing) {
      throw new NotFoundError('Plan', id);
    }

    const [plan] = await db('plans')
      .where({ id })
      .update({
        name,
        daily_dd_percent,
        max_dd_percent,
        daily_dd_is_floating,
        max_dd_is_floating,
        updated_at: new Date(),
      })
      .returning('*');

    res.json({ plan });
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: formatError(error) });
    } else {
      res.status(400).json({ error: formatError(error) });
    }
  }
});

/**
 * DELETE /api/plans/:id
 * Delete plan
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await db('plans').where({ id }).first();
    if (!existing) {
      throw new NotFoundError('Plan', id);
    }

    await db('plans').where({ id }).delete();

    res.json({ success: true });
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: formatError(error) });
    } else {
      res.status(500).json({ error: formatError(error) });
    }
  }
});

export default router;

