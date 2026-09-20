// CLI wrapper around services/orderService/reconcileShiprocketOrderStatus.js
// — see that file for what the reconciliation actually does. This module
// only owns reading a CSV off disk and the argv/exit-code plumbing; the
// same core logic is also called directly by the admin panel's
// upload-CSV -> audit -> apply flow (controllers/admin/inventory/order/
// reconciliation/*.js).
//
// Per ELEXIFY_DATA_OPERATIONS_GUIDE.md's own rule ("needs a per-invocation
// parameter... do not register it — leave it as a standalone CLI script"),
// this is intentionally NOT a Data Operations registry entry.
//
// Usage:
//   node src/scripts/reconcileShiprocketOrderStatus.js --file=./export.csv
//   node src/scripts/reconcileShiprocketOrderStatus.js --file=./export.csv --apply
//   node src/scripts/reconcileShiprocketOrderStatus.js --file=./export.csv --apply --out=./report.json

import fs from "fs";
import path from "path";
import csv from "csv-parser";
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import { reconcileShiprocketOrderStatus } from "../services/orderService/reconcileShiprocketOrderStatus.js";
import { createLogger } from "./shared/logger.js";

export const readCsvRows = (filePath) =>
  new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });

if (process.argv[1]?.endsWith("reconcileShiprocketOrderStatus.js")) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.length ? rest.join("=") : true];
    }),
  );

  const runCli = async () => {
    let exitCode = 0;
    try {
      if (!args.file) throw new Error("Usage: node src/scripts/reconcileShiprocketOrderStatus.js --file=<path.csv> [--apply] [--out=<report.json>]");
      await mongooseConnection;
      const rows = await readCsvRows(path.resolve(args.file));
      const logger = createLogger();
      const report = await reconcileShiprocketOrderStatus({ rows, apply: !!args.apply, logger });
      const output = { generated_at: new Date().toISOString(), source_file: path.resolve(args.file), ...report, logs: logger.logs };
      console.log(JSON.stringify(output, null, 2));
      if (args.out) {
        fs.writeFileSync(path.resolve(args.out), JSON.stringify(output, null, 2));
        console.error(`\nFull report written to ${path.resolve(args.out)}`);
      }
      console.error(`\n${args.apply ? "APPLIED" : "DRY RUN"} — ${JSON.stringify(report.counters)}`);
    } catch (error) {
      console.error(error?.message || error);
      exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
    process.exit(exitCode);
  };
  runCli();
}
