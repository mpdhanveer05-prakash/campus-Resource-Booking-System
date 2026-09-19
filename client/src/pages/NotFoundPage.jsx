import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <main className="page page--centered">
      <h1>Page not found</h1>
      <p>The page you asked for does not exist.</p>
      <Link className="button button--primary" to="/resources">
        Go to resources
      </Link>
    </main>
  )
}
