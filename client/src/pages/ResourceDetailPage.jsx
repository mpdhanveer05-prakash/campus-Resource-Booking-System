import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { api, ApiError, NetworkError } from '../api/client'
import { BookingForm } from '../components/BookingForm'
import { SlotPicker } from '../components/SlotPicker'
import { Spinner, StatusMessage } from '../components/StatusMessage'
import { bookingWindowDates, formatCalendarDate, TIMEZONE_LABEL } from '../lib/datetime'

const DATES = bookingWindowDates()

export function ResourceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [date, setDate] = useState(DATES[0])
  const [availability, setAvailability] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const [selectedSlot, setSelectedSlot] = useState(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState(null)

  const requestRef = useRef(0)

  const loadAvailability = useCallback(
    (signal) => {
      const requestId = ++requestRef.current
      setStatus('loading')
      setError(null)

      return api
        .slots(id, date, signal)
        .then((data) => {
          // A slower response for an earlier date must not replace this one.
          if (requestId !== requestRef.current) return
          setAvailability(data)
          setStatus('ready')
        })
        .catch((caught) => {
          if (caught.name === 'AbortError' || requestId !== requestRef.current) return
          setError(caught.message)
          setStatus('error')
        })
    },
    [id, date],
  )

  useEffect(() => {
    const controller = new AbortController()
    setSelectedSlot(null)
    loadAvailability(controller.signal)
    return () => controller.abort()
  }, [loadAvailability])

  async function handleBooking(purpose) {
    setSubmitting(true)
    setNotice(null)

    try {
      await api.createBooking({ slotId: selectedSlot.id, purpose })
      navigate('/my-bookings', { state: { justBooked: true } })
    } catch (caught) {
      if (caught instanceof NetworkError) {
        // The request may have succeeded: never claim it definitely failed.
        setNotice({
          tone: 'warning',
          title: 'We could not confirm the result',
          body: 'Your booking may or may not have been created. Check My bookings before trying again.',
        })
      } else if (caught instanceof ApiError) {
        setNotice({ tone: 'error', title: 'Booking failed', body: caught.message })
        // A conflict means the snapshot is stale; refresh what is available.
        await loadAvailability()
        setSelectedSlot(null)
      } else {
        setNotice({ tone: 'error', title: 'Booking failed', body: 'Please try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading' && !availability) return <Spinner label="Loading availability" />

  if (status === 'error' && !availability) {
    return (
      <main className="page">
        <StatusMessage tone="error" title="Could not load this resource" onRetry={() => loadAvailability()}>
          {error}
        </StatusMessage>
        <Link to="/resources">Back to resources</Link>
      </main>
    )
  }

  const resource = availability?.resource

  return (
    <main className="page">
      <Link to="/resources" className="back-link">
        ← All resources
      </Link>

      <h1>{resource?.name}</h1>

      <dl className="detail-meta">
        <div>
          <dt>Category</dt>
          <dd>{resource?.category}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{resource?.location}</dd>
        </div>
        <div>
          <dt>Capacity</dt>
          <dd>{resource?.capacity}</dd>
        </div>
      </dl>

      {resource?.description && <p>{resource.description}</p>}

      {resource?.rules && (
        <section className="rules">
          <h2>Rules</h2>
          <p>{resource.rules}</p>
        </section>
      )}

      <section>
        <h2>Choose a date</h2>
        <div className="field">
          <label htmlFor="date">Booking date ({TIMEZONE_LABEL})</label>
          <select id="date" value={date} onChange={(event) => setDate(event.target.value)}>
            {DATES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {formatCalendarDate(candidate)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section>
        <h2>Availability</h2>
        <p className="page__lead">All times are shown in campus time ({TIMEZONE_LABEL}).</p>

        {notice && (
          <StatusMessage tone={notice.tone} title={notice.title}>
            {notice.body}
            {notice.tone === 'warning' && (
              <>
                {' '}
                <Link to="/my-bookings">Open My bookings</Link>
              </>
            )}
          </StatusMessage>
        )}

        {status === 'loading' && <Spinner label="Refreshing availability" />}

        {availability && (
          <SlotPicker
            slots={availability.slots}
            selectedSlotId={selectedSlot?.id}
            onSelect={setSelectedSlot}
          />
        )}
      </section>

      {selectedSlot && (
        <BookingForm
          slot={selectedSlot}
          onSubmit={handleBooking}
          onCancel={() => setSelectedSlot(null)}
          isSubmitting={isSubmitting}
        />
      )}
    </main>
  )
}
