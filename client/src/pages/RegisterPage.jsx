import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'

import { api, ApiError, NetworkError } from '../api/client'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'

export function RegisterPage() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/resources" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setSubmitting(true)

    try {
      await api.register(form)
      // Registration does not sign the user in; they log in explicitly.
      navigate('/login', { state: { registered: true } })
    } catch (caught) {
      if (caught instanceof NetworkError) {
        setError('The server could not be reached. Check your connection and try again.')
      } else if (caught instanceof ApiError) {
        setFieldErrors(caught.fieldErrors)
        setError(caught.message)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth">
      <div className="auth__card">
        <h1>Create your account</h1>
        <p className="auth__lead">Registration creates a student account.</p>

        {error && <StatusMessage tone="error">{error}</StatusMessage>}

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="name">Full name</label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            aria-invalid={fieldErrors.name ? 'true' : undefined}
          />
          {fieldErrors.name && <p className="field__error">{fieldErrors.name}</p>}

          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            aria-invalid={fieldErrors.email ? 'true' : undefined}
          />
          {fieldErrors.email && <p className="field__error">{fieldErrors.email}</p>}

          <label htmlFor="password">
            Password <span className="field__hint">At least 12 characters</span>
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            aria-invalid={fieldErrors.password ? 'true' : undefined}
          />
          {fieldErrors.password && <p className="field__error">{fieldErrors.password}</p>}

          <button type="submit" className="button button--primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth__alt">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </main>
  )
}
