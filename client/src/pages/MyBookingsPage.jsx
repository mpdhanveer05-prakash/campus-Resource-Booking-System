import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'

import { api, ApiError, NetworkError } from '../api/client'
import { EmptyState, Spinner, StatusMessage } from '../components/StatusMessage'
import { formatSlotRange } from '../lib/datetime'

const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
]

/**
 * Groups bookings the way the brief describes.
 *
 * Upcoming, in-progress and past are computed from status and slot times
 * rather than stored, matching the server's own model.
 */
function categorise(booking) {
  if (booking.status === 'CANCELLED') return 'cancelled'
  return new Date(booking.endsAt) > new Date() ? 'upcoming' : 'past'
}

export function MyBookingsPage() {
  const location = useLocation()
  const [tab, setTab] = useState('upcoming')
  const [bookings, setBookings] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [cancellingId, setCancellingId] = useState(null)
  const [notice, setNotice] = useState(
    location.state?.justBooked
      ? { tone: 'success', title: 'Booking confirmed', body: 'Your slot is reserved.' }
      : null,
  )

  const load = useCallback(async (signal) => {
    setStatus('loading')
    setError(null)

    try {
      const data = await api.myBookings('page=1&pageSize=50', signal)
      setBookings(data.items)
      setStatus('ready')
    } catch (caught) {
      if (caught.name === 'AbortError') return
      setError(caught.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function handleCancel(booking) {
    setCancellingId(booking.id)
    setNotice(null)

    try {
      await api.cancelBooking(booking.id)
      setNotice({ tone: 'success', title: 'Booking cancelled', body: 'The slot is available again.' })
      await load()
    } catch (caught) {
      if (caught instanceof NetworkError) {
        setNotice({
          tone: 'warning',
          title: 'We could not confirm the result',
          body: 'Your cancellation may or may not have been applied. Refresh to check.',
        })
      } else if (caught instanceof ApiError) {
        setNotice({ tone: 'error', title: 'Could not cancel', body: caught.message })
        await load()
      }
    } finally {
      setCancellingId(null)
    }
  }

  const visible = bookings.filter((booking) => categorise(booking) === tab)

  return (
    <main className="page">
      <h1>My bookings</h1>

      {notice && (
        <StatusMessage tone={notice.tone} title={notice.title}>
          {notice.body}
          {notice.tone === 'warning' && (
            <>
              {' '}
              <button type="button" className="button button--ghost" onClick={() => load()}>
                Refresh
              </button>
            </>
          )}
        </StatusMessage>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            role="tab"
            aria-selected={tab === candidate.key}
            className={`tab ${tab === candidate.key ? 'tab--active' : ''}`}
            onClick={() => setTab(candidate.key)}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      {status === 'loading' && <Spinner label="Loading your bookings" />}

      {status === 'error' && (
        <StatusMessage tone="error" title="Could not load your bookings" onRetry={() => load()}>
          {error}
        </StatusMessage>
      )}

      {status === 'ready' && visible.length === 0 && (
        <EmptyState title={`No ${tab} bookings`}>
          {tab === 'upcoming' && (
            <>
              Browse the <Link to="/resources">resource catalogue</Link> to book a slot.
            </>
          )}
        </EmptyState>
      )}

      {status === 'ready' && visible.length > 0 && (
        <ul className="booking-list">
          {visible.map((booking) => {
            const canCancel =
              booking.status === 'CONFIRMED' && new Date(booking.startsAt) > new Date()

            return (
              <li key={booking.id} className="booking">
                <div className="booking__main">
                  <h2 className="booking__title">{booking.resourceName}</h2>
                  <p className="booking__when">
                    {formatSlotRange(booking.startsAt, booking.endsAt)}
                  </p>
                  <p className="booking__where">{booking.resourceLocation}</p>
                  <p className="booking__purpose">{booking.purpose}</p>

                  {booking.status === 'CANCELLED' && booking.cancellationReason && (
                    <p className="booking__reason">Reason: {booking.cancellationReason}</p>
                  )}
                </div>

                <div className="booking__side">
                  <span className={`badge badge--${booking.status.toLowerCase()}`}>
                    {booking.status}
                  </span>
                  <code className="booking__ref">{booking.id.slice(0, 8)}</code>

                  {canCancel && (
                    <button
                      type="button"
                      className="button button--danger"
                      onClick={() => handleCancel(booking)}
                      disabled={cancellingId === booking.id}
                    >
                      {cancellingId === booking.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
