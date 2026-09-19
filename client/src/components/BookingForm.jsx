import { useState } from 'react'

import { formatSlotRange } from '../lib/datetime'

const MIN_LENGTH = 10
const MAX_LENGTH = 300

/**
 * Confirms a booking for the selected slot.
 *
 * Duplicate submits are disabled for usability; the server and the database
 * remain the real protection against a double booking.
 */
export function BookingForm({ slot, onSubmit, onCancel, isSubmitting, fieldError }) {
  const [purpose, setPurpose] = useState('')
  const trimmedLength = purpose.trim().length
  const isValid = trimmedLength >= MIN_LENGTH && trimmedLength <= MAX_LENGTH

  function handleSubmit(event) {
    event.preventDefault()
    if (!isValid || isSubmitting) return
    onSubmit(purpose.trim())
  }

  return (
    <form className="booking-form" onSubmit={handleSubmit}>
      <h3>Confirm your booking</h3>
      <p className="booking-form__slot">{formatSlotRange(slot.startsAt, slot.endsAt)}</p>

      <label htmlFor="purpose">
        Purpose <span aria-hidden="true">*</span>
        <span className="field__hint">
          {MIN_LENGTH}–{MAX_LENGTH} characters
        </span>
      </label>
      <textarea
        id="purpose"
        name="purpose"
        rows={3}
        value={purpose}
        onChange={(event) => setPurpose(event.target.value)}
        maxLength={MAX_LENGTH}
        required
        aria-describedby="purpose-count"
        aria-invalid={fieldError ? 'true' : undefined}
      />
      <p id="purpose-count" className="field__hint">
        {trimmedLength}/{MAX_LENGTH}
      </p>

      {fieldError && <p className="field__error">{fieldError}</p>}

      <div className="booking-form__actions">
        <button type="submit" className="button button--primary" disabled={!isValid || isSubmitting}>
          {isSubmitting ? 'Booking…' : 'Confirm booking'}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}
