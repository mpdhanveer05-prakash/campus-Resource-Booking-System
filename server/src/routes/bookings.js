import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import * as bookingService from '../services/bookingService.js';

export const bookingsRouter = Router();

bookingsRouter.use(requireAuth);

const createSchema = z
  .object({
    slotId: z.uuid('Choose a slot'),
    // Trimmed text of 10-300 characters, stored and rendered as text.
    purpose: z
      .string()
      .trim()
      .min(10, 'Describe your purpose in at least 10 characters')
      .max(300, 'Keep the purpose under 300 characters'),
  })
  // Strips any userId a client might submit: identity comes from the session.
  .strip();

const cancelSchema = z
  .object({ reason: z.string().trim().max(300).optional() })
  .strip();

const idParamSchema = z.object({ id: z.uuid('Invalid identifier') });

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

bookingsRouter.post('/', csrfProtection, validate('body', createSchema), async (req, res, next) => {
  try {
    const booking = await bookingService.createBooking({
      // Always the authenticated session user, never a request-body value.
      userId: req.user.id,
      slotId: req.body.slotId,
      purpose: req.body.purpose,
    });

    res.status(201).json({ data: booking });
  } catch (error) {
    next(error);
  }
});

bookingsRouter.get('/mine', validate('query', paginationSchema), async (req, res, next) => {
  try {
    const { items, total } = await bookingService.listMyBookings(req.user.id, req.validatedQuery);
    const { page, pageSize } = req.validatedQuery;

    res.status(200).json({
      data: { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    next(error);
  }
});

bookingsRouter.post(
  '/:id/cancel',
  csrfProtection,
  validate('params', idParamSchema),
  validate('body', cancelSchema),
  async (req, res, next) => {
    try {
      const result = await bookingService.cancelBooking({
        bookingId: req.params.id,
        actor: req.user,
        reason: req.body.reason,
      });

      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);
