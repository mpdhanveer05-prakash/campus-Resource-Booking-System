import { NavLink, useNavigate } from 'react-router'

import { useAuth } from '../context/AuthContext'

export function Navigation() {
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="nav">
      <div className="nav__inner">
        <NavLink to="/resources" className="nav__brand">
          Campus Booking
        </NavLink>

        <nav aria-label="Main">
          <ul className="nav__links">
            <li>
              <NavLink to="/resources">Resources</NavLink>
            </li>
            <li>
              <NavLink to="/my-bookings">My bookings</NavLink>
            </li>
            {isAdmin && (
              <li>
                <NavLink to="/admin">Admin</NavLink>
              </li>
            )}
          </ul>
        </nav>

        <div className="nav__user">
          <span className="nav__username">{user?.name}</span>
          <button type="button" className="button button--ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    </header>
  )
}
