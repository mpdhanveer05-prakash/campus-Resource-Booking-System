import { pool } from '../db/pool.js';
import { bookingWindowEnd, currentCampusDate } from '../domain/slots.js';
import { AppError } from '../middleware/errorHandler.js';
import * as bookingsRepository from '../repositories/bookingsRepository.js';
import { CONFIRMED_BOOKING_INDEX } from '../repositories/bookingsRepository.js';

/** PostgreSQL's unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505';

/**
 * Creates a confirmed booking.
 *
 * The whole operation runs on one borrowed client inside a single transaction:
 * lock the resource, then the slot, revalidate every rule under those locks,
 * insert the booking and its audit event, then commit.
 *
 * The partial unique index remains the final defence: if two requests pass the
 * in-transaction checks simultaneously, exactly one commit survives and the
 * other is mapped to a conflict.
 */
export async function createBooking({ userId, slotId, purpose }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const slot = await bookingsRepository.lockResourceThenSlot(client, slotId);

    if (!slot) {
      throw new AppError(404, 'SLOT_NOT_FOUND', 'That slot does not exist.');
    }

    if (!slot.resourceIsActive) {
      throw new AppError(409, 'RESOURCE_INACTIVE', 'This resource is no longer available.');
    }

    if (!slot.isOpen) {
      throw new AppError(409, 'SLOT_CLOSED', 'This slot is closed for booking.');
    }

    // Server-derived: the browser never asserts that a slot is in the future.
    if (slot.hasStarted) {
      throw new AppError(409, 'SLOT_IN_PAST', 'This slot has already started.');
    }

    if (slot.bookingDate > bookingWindowEnd()) {
      throw new AppError(
        409,
        'DATE_OUT_OF_WINDOW',
        `Bookings are open until ${bookingWindowEnd()}.`,
      );
    }

    if (slot.bookingDate < currentCampusDate()) {
      throw new AppError(409, 'SLOT_IN_PAST', 'This slot has already passed.');
    }

    const booking = await bookingsRepository.insertConfirmed(client, {
      userId,
      slotId,
      purpose,
    });

    await bookingsRepository.insertEvent(client, {
      bookingId: booking.id,
      actorUserId: userId,
      eventType: 'CREATED',
      details: { slotId, bookingDate: slot.bookingDate, slotIndex: slot.slotIndex },
    });

    await client.query('COMMIT');

    return booking;
  } catch (error) {
    await client.query('ROLLBACK');

    // Only this named index means the slot was taken. Every other unique
    // violation keeps its own meaning rather than being mislabelled.
    if (error.code === UNIQUE_VIOLATION && error.constraint === CONFIRMED_BOOKING_INDEX) {
      throw new AppError(
        409,
        'SLOT_ALREADY_BOOKED',
        'This slot was just booked. Please choose another slot.',
      );
    }

    throw error;
  } finally {
    // Always returned to the pool, on every path.
    client.release();
  }
}

/**
 * Cancels a booking.
 *
 * Students may cancel their own booking before it starts. Administrators may
 * cancel any booking before it ends, and must give a reason. Repeating an
 * authorised cancellation returns the existing result and writes no second
 * event.
 */
export async function cancelBooking({ bookingId, actor, reason }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const booking = await bookingsRepository.findByIdForUpdate(client, bookingId);

    if (!booking) {
      throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    const isOwner = booking.userId === actor.id;
    const isAdmin = actor.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new AppError(403, 'FORBIDDEN', 'You can only cancel your own bookings.');
    }

    // Idempotent: repeating an authorised cancellation is not an error and
    // must not append another event.
    if (booking.status === 'CANCELLED') {
      await client.query('COMMIT');
      return {
        id: booking.id,
        status: 'CANCELLED',
        cancelledAt: booking.cancelledAt,
        cancellationReason: booking.cancellationReason,
        alreadyCancelled: true,
      };
    }

    if (isAdmin && !isOwner) {
      const trimmed = typeof reason === 'string' ? reason.trim() : '';

      if (trimmed.length < 3) {
        throw new AppError(
          400,
          'REASON_REQUIRED',
          'A cancellation reason is required when cancelling another user\'s booking.',
        );
      }

      if (booking.hasEnded) {
        throw new AppError(409, 'BOOKING_ENDED', 'This booking has already ended.');
      }
    } else {
      // Owner path, including an admin cancelling their own booking.
      if (booking.hasStarted) {
        throw new AppError(
          409,
          'BOOKING_STARTED',
          'This booking has already started and can no longer be cancelled.',
        );
      }
    }

    const cancelled = await bookingsRepository.markCancelled(client, {
      bookingId,
      cancelledBy: actor.id,
      reason: typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : null,
    });

    await bookingsRepository.insertEvent(client, {
      bookingId,
      actorUserId: actor.id,
      eventType: 'CANCELLED',
      details: { byAdmin: isAdmin && !isOwner, reason: cancelled.cancellationReason },
    });

    await client.query('COMMIT');

    return { ...cancelled, alreadyCancelled: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listMyBookings(userId, pagination) {
  return bookingsRepository.listForUser(userId, pagination);
}

export async function listAllBookings(filters) {
  return bookingsRepository.listAll(filters);
}

export async function listBookingEvents(bookingId) {
  if (!(await bookingsRepository.exists(bookingId))) {
    throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
  }

  return bookingsRepository.listEvents(bookingId);
}
