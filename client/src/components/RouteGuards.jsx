import { Navigate, Outlet, useLocation } from 'react-router'

import { Navigation } from './Navigation'
import { Spinner } from './StatusMessage'
import { useAuth } from '../context/AuthContext'

/**
 * Route guards improve navigation only.
 *
 * The backend enforces every permission independently; hiding a link here is
 * never the protection.
 */
export function RequireAuth() {
  const { isAuthenticated, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <Spinner label="Restoring your session" />

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return (
    <>
      <Navigation />
      <Outlet />
    </>
  )
}

export function RequireAdmin() {
  const { isAdmin, status } = useAuth()

  if (status === 'loading') return <Spinner label="Checking permissions" />
  if (!isAdmin) return <Navigate to="/resources" replace />

  return <Outlet />
}
