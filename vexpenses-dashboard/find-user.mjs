import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_DATABASE_URL);
const rows = await sql`SELECT id, email, name FROM app_users WHERE email ILIKE ${'%italo%'}`;
console.log(JSON.stringify(rows, null, 2));
