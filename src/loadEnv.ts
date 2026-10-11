import * as dotenv from 'dotenv';
import * as path from 'path';

// Imported first from index.ts: imports are evaluated before the importing module's body,
// and some modules read process.env at load time (CURRENCY_SYMBOL, WEBAPP_URL).
const envFile = process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.dev';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
