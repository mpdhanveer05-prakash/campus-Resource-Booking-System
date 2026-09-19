import { Router } from 'express';
import { z } from 'zod';

import { isValidDateString } from '../domain/slots.js';
import { requireAdmin } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import * as bookingService from '../services/bookingService.js';
import * as resourceService from '../services/resourceService.js';

export const adminRouter = Router();

// Every route below requires an administrator. Route guards in React are a
// navigation aid only; this is the actual protection.
adminRouter.use(requireAdmin);

const idParamSchema = z.object({ id: z.uuid('Invalid identifier') });

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const createResourceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().max(1000).default(''),
  location: z.string().trim().min(2).max(120),
  capacity: z.coerce.number().int().positive().max(10_000),
  rules: z.string().trim().max(1000).default(''),
});

const updateResourceSchema = createResourceSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

const generateSlotsSchema = z.object({
  fromDate: z.string().refine(isValidDateString, 'Use a valid YYYY-MM-DD date'),
  toDate: z.string().refine(isValidDateString, 'Use a valid YYYY-MM-DD date'),
});

const slotStateSchema = z.object({ isOpen: z.boolean() });

const bookingFilterSchema = z.object({
  status: z.enum(['CONFIRMED', 'CANCELLED']).optional(),
  resourceId: z.uuid().optional(),
  date: z.string().refine(isValidDateString, 'Use a valid YYYY-MM-DD date').optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

adminRouter.get('/resources', validate('query', paginationSchema), async (req, res, next) => {
  try {
    const { items, total } = await resourceService.listAllResources(req.validatedQuery);
    const { page, pageSize } = req.validatedQuery;

    res.status(200).json({
      data: { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Reads one resource including inactive ones.
 *
 * The public GET /api/resources/:id returns active resources only, which is
 * insufficient for editing a deactivated resource.
 */
adminRouter.get('/resources/:id', validate('params', idParamSchema), async (req, res, next) => {
  try {
    const resource = await resourceService.getResource(req.params.id, { includeInactive: true });
    res.status(200).json({ data: resource });
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  '/resources',
  csrfProtection,
  validate('body', createResourceSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({ data: await resourceService.createResource(req.body) });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  '/resources/:id',
  csrfProtection,
  validate('params', idParamSchema),
  validate('body', updateResourceSchema),
  async (req, res, next) => {
    try {
      const updated = await resourceService.updateResource(req.params.id, req.body);
      res.status(200).json({ data: updated });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  '/resources/:id/slots/generate',
  csrfProtection,
  validate('params', idParamSchema),
  validate('body', generateSlotsSchema),
  async (req, res, next) => {
    try {
      const result = await resourceService.generateSlots(req.params.id, req.body);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  '/slots/:id',
  csrfProtection,
  validate('params', idParamSchema),
  validate('body', slotStateSchema),
  async (req, res, next) => {
    try {
      const slot = await resourceService.setSlotOpenState(req.params.id, req.body.isOpen);
      res.status(200).json({ data: slot });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get('/bookings', validate('query', bookingFilterSchema), async (req, res, next) => {
  try {
    const { items, total } = await bookingService.listAllBookings(req.validatedQuery);
    const { page, pageSize } = req.validatedQuery;

    res.status(200).json({
      data: { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get(
  '/bookings/:id/events',
  validate('params', idParamSchema),
  async (req, res, next) => {
    try {
      const events = await bookingService.listBookingEvents(req.params.id);
      res.status(200).json({ data: { events } });
    } catch (error) {
      next(error);
    }
  },
);
