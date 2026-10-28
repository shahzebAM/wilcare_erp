import { config } from 'dotenv';
import { resolve } from 'node:path';

// src/ and dist/ both sit directly inside this backend project.
config({ path: resolve(__dirname, '..', '.env'), quiet: true });
