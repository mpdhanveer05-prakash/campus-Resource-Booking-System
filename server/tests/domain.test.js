import { describe, expect, it } from 'vitest';

import {
  BOOKING_WINDOW_DAYS,
  MAX_SLOT_INDEX,
  addDays,
  bookingWindowEnd,
  currentCampusDate,
  dateRange,
  isValidDateString,
  isWithinBookingWindow,
  slotLabel,
  toCampusDateString,
} from '../src/domain/slots.js';

describe('campus date handling', () => {
  it('derives the campus date across the UTC midnight boundary', () => {
    // 22:00 UTC on 4 October is already 03:30 on 5 October in Asia/Kolkata.
    const lateUtc = new Date('2026-10-04T22:00:00.000Z');
    expect(toCampusDateString(lateUtc)).toBe('2026-10-05');

    // 17:00 UTC is 22:30 the same campus day.
    const earlierUtc = new Date('2026-10-04T17:00:00.000Z');
    expect(toCampusDateString(earlierUtc)).toBe('2026-10-04');
  });

  it('never shifts a date through the local timezone', () => {
    // A machine in UTC-8 would report the previous day for this instant if the
    // conversion used local time instead of the campus timezone.
    const instant = new Date('2026-01-01T02:00:00.000Z');
    expect(toCampusDateString(instant)).toBe('2026-01-01');
  });

  it('validates calendar date strings', () => {
    expect(isValidDateString('2026-10-05')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('05-10-2026')).toBe(false);
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString(null)).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('builds an inclusive date range', () => {
    expect(dateRange('2026-10-01', '2026-10-03')).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(dateRange('2026-10-01', '2026-10-01')).toEqual(['2026-10-01']);
  });

  it('opens bookings from today through 13 days ahead', () => {
    const today = currentCampusDate();

    expect(isWithinBookingWindow(today)).toBe(true);
    expect(isWithinBookingWindow(addDays(today, BOOKING_WINDOW_DAYS - 1))).toBe(true);
    expect(isWithinBookingWindow(addDays(today, BOOKING_WINDOW_DAYS))).toBe(false);
    expect(isWithinBookingWindow(addDays(today, -1))).toBe(false);
    expect(bookingWindowEnd()).toBe(addDays(today, 13));
  });

  it('labels the eight canonical hours', () => {
    expect(slotLabel(0)).toBe('09:00-10:00');
    expect(slotLabel(MAX_SLOT_INDEX)).toBe('16:00-17:00');
  });
});
