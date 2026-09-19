import { pool } from '../db/pool.js';

const RESOURCE_COLUMNS = `
  id, name, category, description, location, capacity, rules,
  is_active AS "isActive", created_at AS "createdAt"
`;

/**
 * Searches active resources with bounded pagination.
 *
 * @param {{search?: string, category?: string, location?: string, page: number, pageSize: number}} filters
 */
export async function listActive({ search, category, location, page, pageSize }) {
  const conditions = ['is_active = true'];
  const values = [];

  if (search) {
    values.push(`%${search}%`);
    // Matches name or location; ILIKE keeps the search case-insensitive.
    conditions.push(`(name ILIKE $${values.length} OR location ILIKE $${values.length})`);
  }

  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }

  if (location) {
    values.push(location);
    conditions.push(`location = $${values.length}`);
  }

  const where = conditions.join(' AND ');
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    pool.query(
      `SELECT ${RESOURCE_COLUMNS} FROM resources
       WHERE ${where}
       ORDER BY name
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    pool.query(`SELECT count(*)::int AS count FROM resources WHERE ${where}`, values),
  ]);

  return { items: items.rows, total: total.rows[0].count };
}

/** Lists every resource, including inactive ones. Admin only. */
export async function listAll({ page, pageSize }) {
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    pool.query(
      `SELECT ${RESOURCE_COLUMNS} FROM resources ORDER BY name LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    ),
    pool.query('SELECT count(*)::int AS count FROM resources'),
  ]);

  return { items: items.rows, total: total.rows[0].count };
}

/**
 * @param {string} id
 * @param {{includeInactive?: boolean}} [options]
 */
export async function findById(id, { includeInactive = false } = {}) {
  const { rows } = await pool.query(
    `SELECT ${RESOURCE_COLUMNS} FROM resources
     WHERE id = $1 ${includeInactive ? '' : 'AND is_active = true'}`,
    [id],
  );
  return rows[0] ?? null;
}

export async function create({ name, category, description, location, capacity, rules }) {
  const { rows } = await pool.query(
    `INSERT INTO resources (name, category, description, location, capacity, rules)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${RESOURCE_COLUMNS}`,
    [name, category, description ?? '', location, capacity, rules ?? ''],
  );
  return rows[0];
}

/**
 * Applies a partial update. Only supplied fields are written.
 */
export async function update(id, changes) {
  const columnByField = {
    name: 'name',
    category: 'category',
    description: 'description',
    location: 'location',
    capacity: 'capacity',
    rules: 'rules',
    isActive: 'is_active',
  };

  const assignments = [];
  const values = [];

  for (const [field, column] of Object.entries(columnByField)) {
    if (changes[field] !== undefined) {
      values.push(changes[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }

  if (assignments.length === 0) {
    return findById(id, { includeInactive: true });
  }

  values.push(id);

  const { rows } = await pool.query(
    `UPDATE resources SET ${assignments.join(', ')}
     WHERE id = $${values.length}
     RETURNING ${RESOURCE_COLUMNS}`,
    values,
  );

  return rows[0] ?? null;
}

/** Distinct values powering the catalogue's filter controls. */
export async function listFilterOptions() {
  const [categories, locations] = await Promise.all([
    pool.query('SELECT DISTINCT category FROM resources WHERE is_active = true ORDER BY category'),
    pool.query('SELECT DISTINCT location FROM resources WHERE is_active = true ORDER BY location'),
  ]);

  return {
    categories: categories.rows.map((row) => row.category),
    locations: locations.rows.map((row) => row.location),
  };
}
