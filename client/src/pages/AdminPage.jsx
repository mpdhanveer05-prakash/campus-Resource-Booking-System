import { useCallback, useEffect, useState } from 'react'

import { api, ApiError } from '../api/client'
import { EmptyState, Spinner, StatusMessage } from '../components/StatusMessage'
import {
  bookingWindowDates,
  formatCalendarDate,
  formatSlotRange,
  TIMEZONE_LABEL,
} from '../lib/datetime'

const DATES = bookingWindowDates()

const TABS = [
  { key: 'resources', label: 'Resources' },
  { key: 'slots', label: 'Slots' },
  { key: 'bookings', label: 'Bookings' },
]

export function AdminPage() {
  const [tab, setTab] = useState('resources')

  return (
    <main className="page">
      <h1>Administration</h1>

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

      {tab === 'resources' && <ResourcesTab />}
      {tab === 'slots' && <SlotsTab />}
      {tab === 'bookings' && <BookingsTab />}
    </main>
  )
}

const EMPTY_RESOURCE = {
  name: '',
  category: '',
  location: '',
  capacity: 1,
  description: '',
  rules: '',
}

function ResourcesTab() {
  const [resources, setResources] = useState([])
  const [status, setStatus] = useState('loading')
  const [notice, setNotice] = useState(null)
  const [form, setForm] = useState(EMPTY_RESOURCE)
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setSubmitting] = useState(false)

  const load = useCallback(async (signal) => {
    setStatus('loading')
    try {
      const data = await api.adminResources('page=1&pageSize=50', signal)
      setResources(data.items)
      setStatus('ready')
    } catch (caught) {
      if (caught.name === 'AbortError') return
      setNotice({ tone: 'error', title: 'Could not load resources', body: caught.message })
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function handleCreate(event) {
    event.preventDefault()
    setSubmitting(true)
    setFieldErrors({})
    setNotice(null)

    try {
      await api.createResource({ ...form, capacity: Number(form.capacity) })
      setNotice({ tone: 'success', title: 'Resource created', body: form.name })
      setForm(EMPTY_RESOURCE)
      await load()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldErrors(caught.fieldErrors)
        setNotice({ tone: 'error', title: 'Could not create resource', body: caught.message })
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(resource) {
    setNotice(null)

    try {
      await api.updateResource(resource.id, { isActive: !resource.isActive })
      await load()
    } catch (caught) {
      if (caught instanceof ApiError) {
        // A 409 here means outstanding bookings block deactivation.
        setNotice({ tone: 'error', title: 'Could not update resource', body: caught.message })
      }
    }
  }

  return (
    <section>
      {notice && (
        <StatusMessage tone={notice.tone} title={notice.title}>
          {notice.body}
        </StatusMessage>
      )}

      <h2>Add a resource</h2>
      <form className="admin-form" onSubmit={handleCreate}>
        <div className="field">
          <label htmlFor="r-name">Name</label>
          <input
            id="r-name"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          {fieldErrors.name && <p className="field__error">{fieldErrors.name}</p>}
        </div>

        <div className="field">
          <label htmlFor="r-category">Category</label>
          <input
            id="r-category"
            required
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value })}
          />
          {fieldErrors.category && <p className="field__error">{fieldErrors.category}</p>}
        </div>

        <div className="field">
          <label htmlFor="r-location">Location</label>
          <input
            id="r-location"
            required
            value={form.location}
            onChange={(event) => setForm({ ...form, location: event.target.value })}
          />
          {fieldErrors.location && <p className="field__error">{fieldErrors.location}</p>}
        </div>

        <div className="field">
          <label htmlFor="r-capacity">Capacity</label>
          <input
            id="r-capacity"
            type="number"
            min="1"
            required
            value={form.capacity}
            onChange={(event) => setForm({ ...form, capacity: event.target.value })}
          />
          {fieldErrors.capacity && <p className="field__error">{fieldErrors.capacity}</p>}
        </div>

        <div className="field field--wide">
          <label htmlFor="r-description">Description</label>
          <textarea
            id="r-description"
            rows={2}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </div>

        <div className="field field--wide">
          <label htmlFor="r-rules">Rules</label>
          <textarea
            id="r-rules"
            rows={2}
            value={form.rules}
            onChange={(event) => setForm({ ...form, rules: event.target.value })}
          />
        </div>

        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create resource'}
        </button>
      </form>

      <h2>All resources</h2>
      {status === 'loading' && <Spinner label="Loading resources" />}

      {status === 'ready' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Category</th>
                <th scope="col">Location</th>
                <th scope="col">Capacity</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource.id}>
                  <td>{resource.name}</td>
                  <td>{resource.category}</td>
                  <td>{resource.location}</td>
                  <td>{resource.capacity}</td>
                  <td>
                    <span className={`badge badge--${resource.isActive ? 'confirmed' : 'cancelled'}`}>
                      {resource.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => toggleActive(resource)}
                    >
                      {resource.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function SlotsTab() {
  const [resources, setResources] = useState([])
  const [resourceId, setResourceId] = useState('')
  const [date, setDate] = useState(DATES[0])
  const [range, setRange] = useState({ fromDate: DATES[0], toDate: DATES[DATES.length - 1] })
  const [slots, setSlots] = useState([])
  const [status, setStatus] = useState('idle')
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    api
      .adminResources('page=1&pageSize=50', controller.signal)
      .then((data) => {
        setResources(data.items)
        if (data.items.length > 0) setResourceId(data.items[0].id)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const loadSlots = useCallback(async () => {
    if (!resourceId) return
    setStatus('loading')

    try {
      const data = await api.slots(resourceId, date)
      setSlots(data.slots)
      setStatus('ready')
    } catch (caught) {
      setNotice({ tone: 'error', title: 'Could not load slots', body: caught.message })
      setStatus('error')
    }
  }, [resourceId, date])

  useEffect(() => {
    loadSlots()
  }, [loadSlots])

  async function handleGenerate(event) {
    event.preventDefault()
    setNotice(null)

    try {
      const result = await api.generateSlots(resourceId, range)
      setNotice({
        tone: 'success',
        title: 'Slots published',
        body: `${result.slotsCreated} created, ${result.slotsUnchanged} already existed and were left unchanged.`,
      })
      await loadSlots()
    } catch (caught) {
      setNotice({ tone: 'error', title: 'Could not publish slots', body: caught.message })
    }
  }

  async function toggleSlot(slot) {
    setNotice(null)

    try {
      await api.setSlotOpen(slot.id, !slot.isOpen)
      await loadSlots()
    } catch (caught) {
      // A 409 means a confirmed booking blocks closing this slot.
      setNotice({ tone: 'error', title: 'Could not update slot', body: caught.message })
    }
  }

  return (
    <section>
      {notice && (
        <StatusMessage tone={notice.tone} title={notice.title}>
          {notice.body}
        </StatusMessage>
      )}

      <h2>Publish canonical slots</h2>
      <form className="admin-form" onSubmit={handleGenerate}>
        <div className="field">
          <label htmlFor="s-resource">Resource</label>
          <select
            id="s-resource"
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
          >
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="s-from">From</label>
          <select
            id="s-from"
            value={range.fromDate}
            onChange={(event) => setRange({ ...range, fromDate: event.target.value })}
          >
            {DATES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {formatCalendarDate(candidate)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="s-to">To</label>
          <select
            id="s-to"
            value={range.toDate}
            onChange={(event) => setRange({ ...range, toDate: event.target.value })}
          >
            {DATES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {formatCalendarDate(candidate)}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="button button--primary">
          Publish slots
        </button>
      </form>

      <h2>Slots on a date ({TIMEZONE_LABEL})</h2>
      <div className="field">
        <label htmlFor="s-date">Date</label>
        <select id="s-date" value={date} onChange={(event) => setDate(event.target.value)}>
          {DATES.map((candidate) => (
            <option key={candidate} value={candidate}>
              {formatCalendarDate(candidate)}
            </option>
          ))}
        </select>
      </div>

      {status === 'loading' && <Spinner label="Loading slots" />}

      {status === 'ready' && slots.length === 0 && (
        <EmptyState title="No slots published for this date">
          Use the form above to publish canonical slots.
        </EmptyState>
      )}

      {status === 'ready' && slots.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">State</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.id}>
                  <td>{formatSlotRange(slot.startsAt, slot.endsAt)}</td>
                  <td>
                    <span className={`badge badge--${slot.state.toLowerCase()}`}>{slot.state}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => toggleSlot(slot)}
                      disabled={slot.state === 'PAST'}
                    >
                      {slot.isOpen ? 'Close' : 'Open'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function BookingsTab() {
  const [bookings, setBookings] = useState([])
  const [filters, setFilters] = useState({ status: '', date: '' })
  const [status, setStatus] = useState('loading')
  const [notice, setNotice] = useState(null)
  const [events, setEvents] = useState({ bookingId: null, items: [] })

  const load = useCallback(async (signal) => {
    setStatus('loading')

    const query = new URLSearchParams({ page: '1', pageSize: '50' })
    if (filters.status) query.set('status', filters.status)
    if (filters.date) query.set('date', filters.date)

    try {
      const data = await api.adminBookings(query.toString(), signal)
      setBookings(data.items)
      setStatus('ready')
    } catch (caught) {
      if (caught.name === 'AbortError') return
      setNotice({ tone: 'error', title: 'Could not load bookings', body: caught.message })
      setStatus('error')
    }
  }, [filters])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function handleCancel(booking) {
    const reason = window.prompt('Reason for cancelling this booking (required):')
    if (reason === null) return

    setNotice(null)

    try {
      await api.cancelBooking(booking.id, reason)
      setNotice({ tone: 'success', title: 'Booking cancelled', body: booking.resourceName })
      await load()
    } catch (caught) {
      setNotice({ tone: 'error', title: 'Could not cancel', body: caught.message })
    }
  }

  async function showEvents(booking) {
    try {
      const data = await api.bookingEvents(booking.id)
      setEvents({ bookingId: booking.id, items: data.events })
    } catch (caught) {
      setNotice({ tone: 'error', title: 'Could not load history', body: caught.message })
    }
  }

  return (
    <section>
      {notice && (
        <StatusMessage tone={notice.tone} title={notice.title}>
          {notice.body}
        </StatusMessage>
      )}

      <div className="filters">
        <div className="field">
          <label htmlFor="b-status">Status</label>
          <select
            id="b-status"
            value={filters.status}
            onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          >
            <option value="">All</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="b-date">Date</label>
          <select
            id="b-date"
            value={filters.date}
            onChange={(event) => setFilters({ ...filters, date: event.target.value })}
          >
            <option value="">All dates</option>
            {DATES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {formatCalendarDate(candidate)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {status === 'loading' && <Spinner label="Loading bookings" />}

      {status === 'ready' && bookings.length === 0 && <EmptyState title="No bookings match" />}

      {status === 'ready' && bookings.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Resource</th>
                <th scope="col">When</th>
                <th scope="col">Student</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td>{booking.resourceName}</td>
                  <td>{formatSlotRange(booking.startsAt, booking.endsAt)}</td>
                  <td>
                    {booking.userName}
                    <br />
                    <span className="muted">{booking.userEmail}</span>
                  </td>
                  <td>
                    <span className={`badge badge--${booking.status.toLowerCase()}`}>
                      {booking.status}
                    </span>
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => showEvents(booking)}
                    >
                      History
                    </button>
                    {booking.status === 'CONFIRMED' && (
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() => handleCancel(booking)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {events.bookingId && (
        <section className="events">
          <h3>Event history</h3>
          <ul>
            {events.items.map((event) => (
              <li key={event.id}>
                <strong>{event.eventType}</strong> — {new Date(event.occurredAt).toLocaleString()}
                {event.actorName && <> by {event.actorName}</>}
                {event.details?.reason && <> — {event.details.reason}</>}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setEvents({ bookingId: null, items: [] })}
          >
            Close
          </button>
        </section>
      )}
    </section>
  )
}
