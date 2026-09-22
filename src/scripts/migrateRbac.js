import mongoose from 'mongoose';
import { envs } from '../config/envs.js';
import { migrateRbac } from '../services/rbac/migrate.js';
try {
  await mongoose.connect(envs.MONGODB_URI);
  console.log(JSON.stringify(await migrateRbac({ dryRun: process.argv.includes('--dry-run') })));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
