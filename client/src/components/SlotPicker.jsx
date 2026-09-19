import { formatTime } from '../lib/datetime'

const STATE_LABELS = {
  AVAILABLE: 'Available',
  BOOKED: 'Booked',
  CLOSED: 'Closed',
  PAST: 'Past',
}

/**
 * Renders the eight canonical hours for a date.
 *
 * Only AVAILABLE slots are selectable; the others stay visible so the grid
 * reads as a full day rather than hiding what is unavailable.
 */
export function SlotPicker({ slots, selectedSlotId, onSelect }) {
  return (
    <div className="slots" role="group" aria-label="Available time slots">
      {slots.map((slot) => {
        const isSelectable = slot.state === 'AVAILABLE'
        const isSelected = slot.id === selectedSlotId

        return (
          <button
            key={slot.id}
            type="button"
            className={`slot slot--${slot.state.toLowerCase()} ${isSelected ? 'slot--selected' : ''}`}
            onClick={() => isSelectable && onSelect(slot)}
            disabled={!isSelectable}
            aria-pressed={isSelected}
          >
            <span className="slot__time">
              {formatTime(slot.startsAt)}–{formatTime(slot.endsAt)}
            </span>
            <span className="slot__state">{STATE_LABELS[slot.state]}</span>
          </button>
        )
      })}
    </div>
  )
}
