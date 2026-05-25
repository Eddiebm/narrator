import { neon } from '@neondatabase/serverless';

// Lazy init so missing DATABASE_URL only throws at request time
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}
