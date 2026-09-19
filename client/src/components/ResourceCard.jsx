import { Link } from 'react-router'

/** Summary card linking to a resource's availability. */
export function ResourceCard({ resource }) {
  return (
    <article className="card">
      <header className="card__header">
        <h3 className="card__title">{resource.name}</h3>
        <span className="tag">{resource.category}</span>
      </header>

      <dl className="card__meta">
        <div>
          <dt>Location</dt>
          <dd>{resource.location}</dd>
        </div>
        <div>
          <dt>Capacity</dt>
          <dd>{resource.capacity}</dd>
        </div>
      </dl>

      {resource.description && <p className="card__description">{resource.description}</p>}

      <Link className="button button--primary" to={`/resources/${resource.id}`}>
        View availability
      </Link>
    </article>
  )
}
