import { randomUUID } from 'node:crypto';

const HEADER = 'x-request-id';

/**
 * Assigns a request ID to every request and echoes it back on the response.
 *
 * An inbound header is reused so a reverse proxy can correlate its own logs;
 * otherwise a fresh UUID is generated.
 */
export function requestId(req, res, next) {
  const incoming = req.get(HEADER);
  const id = typeof incoming === 'string' && incoming.trim() !== '' ? incoming.trim() : randomUUID();

  req.id = id;
  res.setHeader(HEADER, id);
  next();
}
