import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const { 
  PORT, 
  HOST,
  GEMINI_API_KEY,
  DATABASE_URL,
  JWT_SECRET,
  JWT_EXPIRATION,
  LOG_LEVEL,
  NODE_ENV,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  FRONTEND_URL
} = process.env;
