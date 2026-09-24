/**
 * Backup del catálogo de productos (sin inventarios ni movimientos).
 *
 * Incluye: units, areas, categories, products, product_recipes.
 * Excluye: inventories, inventory_movements, ventas, compras, viajes, etc.
 *
 * Uso:
 *   node scripts/backup-products.js
 *   node scripts/backup-products.js --restore backups/products-2026-09-23.sql
 *
 * Lee DB_* / DATABASE_URL de .env
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TABLES = {
  units: 'units',
  areas: 'areas',
  categories: 'categories',
  products: 'products',
  recipes: 'product_recipes',
};

function clientConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'admin123',
    database: process.env.DB_NAME || 'sistema-inventario',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return `'${value.toISOString().replace('T', ' ').replace('Z', '')}'`;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'object') {
    if (typeof value.toISOString === 'function') {
      return `'${value.toISOString().replace('T', ' ').replace('Z', '')}'`;
    }
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function insertSql(table, rows) {
  if (!rows.length) return `-- ${table}: 0 filas\n`;
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const values = rows
    .map((row) => `(${cols.map((c) => sqlLiteral(row[c])).join(', ')})`)
    .join(',\n');
  return `INSERT INTO "${table}" (${colList}) VALUES\n${values};\n`;
}

async function fetchAll(client, table) {
  const { rows } = await client.query(`SELECT * FROM "${table}"`);
  return rows;
}

async function backup() {
  const client = new Client(clientConfig());
  await client.connect();
  try {
    const units = await fetchAll(client, TABLES.units);
    const areas = await fetchAll(client, TABLES.areas);
    const categories = await fetchAll(client, TABLES.categories);
    const products = await fetchAll(client, TABLES.products);
    const recipes = await fetchAll(client, TABLES.recipes);

    const productsRoots = products.filter((p) => !p.parent_id);
    const productsVariants = products.filter((p) => p.parent_id);
    const areasNoPrev = areas.map((a) => ({ ...a, previous_area_id: null }));

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, `products-${stamp}`);

    const payload = {
      generatedAt: new Date().toISOString(),
      excluded: ['inventories', 'inventory_movements'],
      counts: {
        units: units.length,
        areas: areas.length,
        categories: categories.length,
        products: products.length,
        product_recipes: recipes.length,
      },
      units,
      areas,
      categories,
      products,
      product_recipes: recipes,
    };
    fs.writeFileSync(`${base}.json`, JSON.stringify(payload, null, 2), 'utf8');

    const sql = [
      '-- Catálogo de productos (sin inventarios)',
      `-- Generado: ${payload.generatedAt}`,
      `-- units=${units.length} areas=${areas.length} categories=${categories.length} products=${products.length} recipes=${recipes.length}`,
      'BEGIN;',
      '',
      '-- 1. Unidades',
      insertSql(TABLES.units, units),
      '-- 2. Áreas (sin previous_area_id para respetar el auto-FK)',
      insertSql(TABLES.areas, areasNoPrev),
      areas.some((a) => a.previous_area_id)
        ? areas
            .filter((a) => a.previous_area_id)
            .map(
              (a) =>
                `UPDATE "${TABLES.areas}" SET previous_area_id = ${sqlLiteral(a.previous_area_id)} WHERE id = ${sqlLiteral(a.id)};`,
            )
            .join('\n')
        : '-- (sin previous_area_id)',
      '',
      '-- 3. Categorías (usan default_unit_id)',
      insertSql(TABLES.categories, categories),
      '-- 4. Productos maestros / sin padre',
      insertSql(TABLES.products, productsRoots),
      '-- 5. Variantes (parent_id)',
      insertSql(TABLES.products, productsVariants),
      '-- 6. Recetas / BOM',
      insertSql(TABLES.recipes, recipes),
      'COMMIT;',
      '',
    ].join('\n');

    fs.writeFileSync(`${base}.sql`, sql, 'utf8');

    console.log('Backup listo (sin inventarios):');
    console.log(`  ${base}.json`);
    console.log(`  ${base}.sql`);
    console.log('Conteos:', payload.counts);
  } finally {
    await client.end();
  }
}

async function restore(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    throw new Error(`No existe ${abs}`);
  }
  const sql = fs.readFileSync(abs, 'utf8');
  const client = new Client(clientConfig());
  await client.connect();
  try {
    await client.query(sql);
    console.log(`Restore OK: ${abs}`);
  } catch (err) {
    console.error('Restore falló. Si las tablas ya tienen datos, vacía catálogo o usa IDs nuevos.');
    throw err;
  } finally {
    await client.end();
  }
}

async function main() {
  const restoreIdx = process.argv.indexOf('--restore');
  if (restoreIdx !== -1) {
    const file = process.argv[restoreIdx + 1];
    if (!file) throw new Error('Uso: node scripts/backup-products.js --restore backups/archivo.sql');
    await restore(file);
    return;
  }
  await backup();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
