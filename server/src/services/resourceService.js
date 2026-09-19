import { pool } from '../db/pool.js';
import {
  MIN_SLOT_INDEX,
  SLOT_COUNT,
  bookingWindowEnd,
  currentCampusDate,
  dateRange,
  isWithinBookingWindow,
} from '../domain/slots.js';
import { AppError } from '../middleware/errorHandler.js';
import * as resourcesRepository from '../repositories/resourcesRepository.js';
import * as slotsRepository from '../repositories/slotsRepository.js';

/** Canonical indexes, constructed by the server rather than accepted as input. */
const CANONICAL_INDEXES = Array.from({ length: SLOT_COUNT }, (_, i) => MIN_SLOT_INDEX + i);

export async function listResources(filters) {
  return resourcesRepository.listActive(filters);
}

export async function listAllResources(pagination) {
  return resourcesRepository.listAll(pagination);
}

export async function getResource(id, { includeInactive = false } = {}) {
  const resource = await resourcesRepository.findById(id, { includeInactive });

  if (!resource) {
    throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }

  return resource;
}

/**
 * Availability for a resource on a campus date.
 *
 * The date must lie inside the booking window; the window is derived from
 * server time, never from a client claim.
 */
export async function getAvailability(resourceId, bookingDate) {
  const resource = await getResource(resourceId);

  if (!isWithinBookingWindow(bookingDate)) {
    throw new AppError(
      400,
      'DATE_OUT_OF_WINDOW',
      `Choose a date between ${currentCampusDate()} and ${bookingWindowEnd()}.`,
    );
  }

  const slots = await slotsRepository.listForResourceAndDate(resourceId, bookingDate);

  return {
    resource,
    bookingDate,
    slots: slots.map((slot) => ({
      ...slot,
      // The single state the UI renders, derived server-side.
      state: deriveSlotState(slot),
    })),
  };
}

/**
 * Collapses the flags into one display state.
 *
 * Order matters: a past slot reads as past even if it was also booked.
 */
function deriveSlotState(slot) {
  if (slot.hasStarted) return 'PAST';
  if (!slot.isOpen) return 'CLOSED';
  if (slot.isBooked) return 'BOOKED';
  return 'AVAILABLE';
}

export async function createResource(input) {
  return resourcesRepository.create(input);
}

/**
 * Edits a resource.
 *
 * Deactivation is refused while a confirmed booking has not yet ended: an
 * administrator must cancel those bookings first. The resource row is locked so
 * the check and the write cannot interleave with a booking.
 */
export async function updateResource(id, changes) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Consistent lock order across the application: resource, then slot.
    const { rows: locked } = await client.query(
      'SELECT id, is_active FROM resources WHERE id = $1 FOR UPDATE',
      [id],
    );

    if (locked.length === 0) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
    }

    if (changes.isActive === false) {
      const { rows: outstanding } = await client.query(
        `SELECT count(*)::int AS count
         FROM bookings b
         JOIN resource_slots s ON s.id = b.slot_id
         WHERE s.resource_id = $1
           AND b.status = 'CONFIRMED'
           AND (
             (s.booking_date + TIME '09:00' + (s.slot_index + 1) * INTERVAL '1 hour')
               AT TIME ZONE 'Asia/Kolkata'
           ) > now()`,
        [id],
      );

      if (outstanding[0].count > 0) {
        throw new AppError(
          409,
          'RESOURCE_HAS_BOOKINGS',
          `Cannot deactivate: ${outstanding[0].count} confirmed booking(s) have not ended. Cancel them first.`,
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const updated = await resourcesRepository.update(id, changes);

  if (!updated) {
    throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }

  return updated;
}

/**
 * Publishes canonical slots across a validated date range.
 */
export async function generateSlots(resourceId, { fromDate, toDate }) {
  await getResource(resourceId, { includeInactive: true });

  if (fromDate > toDate) {
    throw new AppError(400, 'INVALID_DATE_RANGE', 'fromDate must not be after toDate.');
  }

  if (!isWithinBookingWindow(fromDate) || !isWithinBookingWindow(toDate)) {
    throw new AppError(
      400,
      'DATE_OUT_OF_WINDOW',
      `Dates must fall between ${currentCampusDate()} and ${bookingWindowEnd()}.`,
    );
  }

  const dates = dateRange(fromDate, toDate);
  const created = await slotsRepository.generate(resourceId, dates, CANONICAL_INDEXES);

  return {
    resourceId,
    fromDate,
    toDate,
    datesCovered: dates.length,
    slotsCreated: created,
    // Existing rows, including closed ones, were left untouched.
    slotsUnchanged: dates.length * CANONICAL_INDEXES.length - created,
  };
}

/**
 * Opens or closes a slot.
 *
 * Closing is refused while a confirmed booking on that slot has not ended.
 */
export async function setSlotOpenState(slotId, isOpen) {
  const slot = await slotsRepository.findById(slotId);

  if (!slot) {
    throw new AppError(404, 'SLOT_NOT_FOUND', 'Slot not found.');
  }

  if (isOpen === false) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS count
       FROM bookings b
       JOIN resource_slots s ON s.id = b.slot_id
       WHERE b.slot_id = $1
         AND b.status = 'CONFIRMED'
         AND (
           (s.booking_date + TIME '09:00' + (s.slot_index + 1) * INTERVAL '1 hour')
             AT TIME ZONE 'Asia/Kolkata'
         ) > now()`,
      [slotId],
    );

    if (rows[0].count > 0) {
      throw new AppError(
        409,
        'SLOT_HAS_BOOKING',
        'Cannot close this slot: it has a confirmed booking that has not ended. Cancel it first.',
      );
    }
  }

  return slotsRepository.setOpenState(slotId, isOpen);
}

export async function getFilterOptions() {
  return resourcesRepository.listFilterOptions();
}
