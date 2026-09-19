import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'

import { ApiError, NetworkError } from '../api/client'
import { StatusMessage } from '../components/StatusMessage'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [isSubmitting, setSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to={location.state?.from ?? '/resources'} replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await login(form.email, form.password)
      navigate(location.state?.from ?? '/resources', { replace: true })
    } catch (caught) {
      if (caught instanceof NetworkError) {
        setError('The server could not be reached. Check your connection and try again.')
      } else if (caught instanceof ApiError) {
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
        <h1>Sign in</h1>
        <p className="auth__lead">Use your campus account to book a resource.</p>

        {error && <StatusMessage tone="error">{error}</StatusMessage>}

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />

          <button type="submit" className="button button--primary" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth__alt">
          No account? <Link to="/register">Register</Link>
        </p>
      </div>
    </main>
  )
}
