import { useEffect, useState } from 'react'

import { getLiveness } from './api/client'
import './App.css'

/**
 * Scaffold placeholder.
 *
 * Verifies that the Vite /api proxy reaches the Express API. Application
 * screens, routing and features are built in later phases.
 */
function App() {
  const [status, setStatus] = useState('checking')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    let cancelled = false

    getLiveness()
      .then((data) => {
        if (cancelled) return
        setStatus('connected')
        setDetail(JSON.stringify(data))
      })
      .catch((error) => {
        if (cancelled) return
        setStatus('unreachable')
        setDetail(error.message)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main>
      <h1>Campus Resource Booking System</h1>
      <p>Phase 1 scaffold. No application features are implemented yet.</p>
      <section>
        <h2>API connectivity</h2>
        <p>
          <strong>Status:</strong> {status}
        </p>
        {detail && <pre>{detail}</pre>}
      </section>
    </main>
  )
}

export default App
