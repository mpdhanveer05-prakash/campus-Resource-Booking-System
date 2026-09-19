import { Router } from 'express';
import { z } from 'zod';

import { isValidDateString } from '../domain/slots.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as resourceService from '../services/resourceService.js';

export const resourcesRouter = Router();

// Pagination is bounded so a client cannot request an unlimited page.
const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  location: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

const idParamSchema = z.object({ id: z.uuid('Invalid identifier') });

const slotsQuerySchema = z.object({
  date: z.string().refine(isValidDateString, 'Use a valid YYYY-MM-DD date'),
});

resourcesRouter.use(requireAuth);

resourcesRouter.get('/', validate('query', listQuerySchema), async (req, res, next) => {
  try {
    const { items, total } = await resourceService.listResources(req.validatedQuery);
    const { page, pageSize } = req.validatedQuery;

    res.status(200).json({
      data: { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    next(error);
  }
});

/** Filter options for the catalogue controls. */
resourcesRouter.get('/filters', async (_req, res, next) => {
  try {
    res.status(200).json({ data: await resourceService.getFilterOptions() });
  } catch (error) {
    next(error);
  }
});

resourcesRouter.get('/:id', validate('params', idParamSchema), async (req, res, next) => {
  try {
    res.status(200).json({ data: await resourceService.getResource(req.params.id) });
  } catch (error) {
    next(error);
  }
});

resourcesRouter.get(
  '/:id/slots',
  validate('params', idParamSchema),
  validate('query', slotsQuerySchema),
  async (req, res, next) => {
    try {
      const availability = await resourceService.getAvailability(
        req.params.id,
        req.validatedQuery.date,
      );
      res.status(200).json({ data: availability });
    } catch (error) {
      next(error);
    }
  },
);
