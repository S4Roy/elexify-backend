import mongoose from "mongoose";
import { assertSafeE2EDatabase } from "./e2eDatabaseGuard.js";

const uri = process.env.E2E_MONGODB_URI || "mongodb://127.0.0.1:27129/elexify_e2e?replicaSet=elexifyE2ERs";
assertSafeE2EDatabase(uri);
await mongoose.connect(uri);
const database = mongoose.connection.name;
await mongoose.connection.db.dropDatabase();
await mongoose.disconnect();
console.log(`Cleaned dedicated E2E database: ${database}`);

