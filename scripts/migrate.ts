import { createDatabase } from '../src/infrastructure/db/client';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  console.log(`Running migrations against ${url}...`);

  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const postgres = (await import('postgres')).default;

    const migrationClient = postgres(url, { max: 1 });
    const db = drizzle(migrationClient);
    await migrate(db, { migrationsFolder: './drizzle' });
    await migrationClient.end();
  } else if (url.startsWith('pglite://')) {
    // For PGlite, creating the database automatically applies migrations.
    await createDatabase(url);
  } else {
    throw new Error(`Unsupported migration DATABASE_URL: ${url}`);
  }

  console.log('Migrations complete!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
