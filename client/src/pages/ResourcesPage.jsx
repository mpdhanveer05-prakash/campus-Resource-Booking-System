import { useEffect, useRef, useState } from 'react'

import { api } from '../api/client'
import { ResourceCard } from '../components/ResourceCard'
import { EmptyState, Spinner, StatusMessage } from '../components/StatusMessage'

const PAGE_SIZE = 12

export function ResourcesPage() {
  const [filters, setFilters] = useState({ search: '', category: '', location: '' })
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [options, setOptions] = useState({ categories: [], locations: [] })
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  // Identifies the newest request so a slow earlier response cannot overwrite
  // a fresher one.
  const requestRef = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    api
      .resourceFilters(controller.signal)
      .then(setOptions)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++requestRef.current

    setStatus('loading')
    setError(null)

    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (filters.search.trim()) query.set('search', filters.search.trim())
    if (filters.category) query.set('category', filters.category)
    if (filters.location) query.set('location', filters.location)

    api
      .resources(query.toString(), controller.signal)
      .then((data) => {
        // Discard a response that a newer request has already superseded.
        if (requestId !== requestRef.current) return
        setResult(data)
        setStatus('ready')
      })
      .catch((caught) => {
        if (caught.name === 'AbortError' || requestId !== requestRef.current) return
        setError(caught.message)
        setStatus('error')
      })

    return () => controller.abort()
  }, [filters, page])

  function updateFilter(key, value) {
    setPage(1)
    setFilters((current) => ({ ...current, [key]: value }))
  }

  return (
    <main className="page">
      <h1>Resources</h1>
      <p className="page__lead">Book a campus resource for a one-hour slot.</p>

      <form className="filters" role="search" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="search">Search</label>
          <input
            id="search"
            type="search"
            value={filters.search}
            placeholder="Name or location"
            onChange={(event) => updateFilter('search', event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            value={filters.category}
            onChange={(event) => updateFilter('category', event.target.value)}
          >
            <option value="">All categories</option>
            {options.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="location">Location</label>
          <select
            id="location"
            value={filters.location}
            onChange={(event) => updateFilter('location', event.target.value)}
          >
            <option value="">All locations</option>
            {options.locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>
      </form>

      {status === 'loading' && <Spinner label="Loading resources" />}

      {status === 'error' && (
        <StatusMessage tone="error" title="Could not load resources" onRetry={() => setPage(page)}>
          {error}
        </StatusMessage>
      )}

      {status === 'ready' && result.items.length === 0 && (
        <EmptyState title="No resources match your filters">
          Try clearing the search or choosing a different category.
        </EmptyState>
      )}

      {status === 'ready' && result.items.length > 0 && (
        <>
          <div className="grid">
            {result.items.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>

          {result.totalPages > 1 && (
            <nav className="pagination" aria-label="Pagination">
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setPage((current) => current - 1)}
                disabled={page <= 1}
              >
                Previous
              </button>
              <span>
                Page {result.page} of {result.totalPages}
              </span>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= result.totalPages}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </main>
  )
}
