/** Load .env.local (then .env) for scripts run with tsx. Import first. */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
