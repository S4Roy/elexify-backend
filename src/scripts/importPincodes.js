// Imports the India Post pincode directory (src/assets/locales/india_pincodes.csv
// — source: github.com/avinashcelestine/Pincodes-data, ~154k post offices,
// 19,100 unique pincodes) into the `pincodes` collection, resolving each
// pincode to our existing City/State/Country records so the address form
// can auto-fill from a pincode alone.
//
// Safe to re-run: upserts by pincode, never touches `status` on an existing
// row (an admin's include/exclude decision always wins over re-import).
//
// Usage: node src/scripts/importPincodes.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import csv from "csv-parser";
import mongoose from "../config/mongoose.js";
import Pincode from "../models/Pincode.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "../assets/locales/india_pincodes.csv");
const INDIA_COUNTRY_ID = 101;

// Source uses pre-2020 / all-caps state names in places; map them onto the
// exact names our own `states` collection uses. "NULL" rows are dropped.
const STATE_ALIASES = {
  "ANDAMAN & NICOBAR ISLANDS": "Andaman and Nicobar Islands",
  "ANDHRA PRADESH": "Andhra Pradesh",
  "ARUNACHAL PRADESH": "Arunachal Pradesh",
  ASSAM: "Assam",
  BIHAR: "Bihar",
  CHANDIGARH: "Chandigarh",
  CHATTISGARH: "Chhattisgarh",
  "DADRA & NAGAR HAVELI": "Dadra and Nagar Haveli and Daman and Diu",
  "DAMAN & DIU": "Dadra and Nagar Haveli and Daman and Diu",
  DELHI: "Delhi",
  GOA: "Goa",
  GUJARAT: "Gujarat",
  HARYANA: "Haryana",
  "HIMACHAL PRADESH": "Himachal Pradesh",
  "JAMMU & KASHMIR": "Jammu and Kashmir",
  JHARKHAND: "Jharkhand",
  KARNATAKA: "Karnataka",
  KERALA: "Kerala",
  LAKSHADWEEP: "Lakshadweep",
  "MADHYA PRADESH": "Madhya Pradesh",
  MAHARASHTRA: "Maharashtra",
  MANIPUR: "Manipur",
  MEGHALAYA: "Meghalaya",
  MIZORAM: "Mizoram",
  NAGALAND: "Nagaland",
  ODISHA: "Odisha",
  PONDICHERRY: "Puducherry",
  PUNJAB: "Punjab",
  RAJASTHAN: "Rajasthan",
  SIKKIM: "Sikkim",
  "TAMIL NADU": "Tamil Nadu",
  TELANGANA: "Telangana",
  TRIPURA: "Tripura",
  "UTTAR PRADESH": "Uttar Pradesh",
  UTTARAKHAND: "Uttarakhand",
  "WEST BENGAL": "West Bengal",
};

// A district name that doesn't match any city verbatim — strip these
// administrative suffixes and retry once before giving up.
const DISTRICT_SUFFIX_STRIP = [/ Urban$/i, / Rural$/i, / District$/i, /\s*\([^)]*\)\s*$/];

// Source district names that are old/British-era or misspelled relative to
// our geonames-based city collection — verified against the DB before
// adding each entry here.
const CITY_ALIASES = {
  bangalore: "Bengaluru",
  mysore: "Mysuru",
  tumkur: "Tumakuru",
  bellary: "Ballari",
  gulbarga: "Kalaburgi",
  chickmagalur: "Chikkamagaluru",
  belgaum: "Belagavi",
  davangere: "Davanagere",
  tuticorin: "Thoothukudi",
  ananthapur: "Anantapur",
  "karim nagar": "Karimnagar",
  "mahabub nagar": "Mahbubnagar",
  "ahmed nagar": "Ahmednagar",
  darjiling: "Darjeeling",
  hooghly: "Hooghly district",
  baleswar: "Balasore",
  khorda: "Khordha",
  sundergarh: "Sundargarh",
  jajapur: "Jajpur",
  jhujhunu: "Jhunjhunun",
};

const readCsvRows = () =>
  new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });

const run = async () => {
  console.log("Reading CSV...");
  const rows = await readCsvRows();
  console.log(`${rows.length} post office rows read.`);

  // Dedupe to one (district, state) per pincode by majority vote — a
  // handful of pincodes span two districts on the boundary.
  const byPincode = new Map();
  for (const row of rows) {
    const pincode = (row.pincode || "").trim();
    const stateSource = (row.statename || "").trim().toUpperCase();
    const district = (row.Districtname || "").trim();
    if (!/^\d{6}$/.test(pincode) || stateSource === "NULL" || !district) continue;

    if (!byPincode.has(pincode)) byPincode.set(pincode, new Map());
    const key = `${district}|${stateSource}`;
    const counts = byPincode.get(pincode);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  console.log(`${byPincode.size} unique pincodes after cleanup.`);

  // Load India's states/cities into memory once for fast lookup instead of
  // one query per pincode.
  const State = mongoose.model("states", new mongoose.Schema({}, { strict: false }));
  const City = mongoose.model("cities", new mongoose.Schema({}, { strict: false }));

  const states = await State.find({ country_id: INDIA_COUNTRY_ID }).select("id name").lean();
  const stateIdByName = new Map(states.map((s) => [s.name.toLowerCase(), s.id]));

  const cities = await City.find({ country_id: INDIA_COUNTRY_ID }).select("id name state_id").lean();
  const cityIdByStateAndName = new Map();
  for (const c of cities) {
    cityIdByStateAndName.set(`${c.state_id}|${c.name.toLowerCase()}`, c.id);
  }

  let resolvedBoth = 0;
  let resolvedStateOnly = 0;
  let resolvedNeither = 0;
  const unresolvedStates = new Set();

  const ops = [];
  for (const [pincode, counts] of byPincode) {
    const [topKey] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const [district, stateSource] = topKey.split("|");

    const stateName = STATE_ALIASES[stateSource];
    const state_id = stateName ? stateIdByName.get(stateName.toLowerCase()) ?? null : null;
    if (!state_id) unresolvedStates.add(stateSource);

    let city_id = null;
    if (state_id) {
      city_id = cityIdByStateAndName.get(`${state_id}|${district.toLowerCase()}`) ?? null;

      if (!city_id) {
        const aliased = CITY_ALIASES[district.toLowerCase()];
        if (aliased) city_id = cityIdByStateAndName.get(`${state_id}|${aliased.toLowerCase()}`) ?? null;
      }

      if (!city_id) {
        for (const re of DISTRICT_SUFFIX_STRIP) {
          const stripped = district.replace(re, "").trim();
          if (stripped !== district) {
            city_id = cityIdByStateAndName.get(`${state_id}|${stripped.toLowerCase()}`) ?? null;
            if (!city_id) {
              const aliased = CITY_ALIASES[stripped.toLowerCase()];
              if (aliased) city_id = cityIdByStateAndName.get(`${state_id}|${aliased.toLowerCase()}`) ?? null;
            }
            if (city_id) break;
          }
        }
      }
    }

    if (city_id && state_id) resolvedBoth += 1;
    else if (state_id) resolvedStateOnly += 1;
    else resolvedNeither += 1;

    ops.push({
      updateOne: {
        filter: { pincode },
        update: {
          $set: {
            district,
            source_state_name: stateSource,
            city_id,
            state_id,
            country_id: INDIA_COUNTRY_ID,
            updated_at: new Date(),
          },
          $setOnInsert: { status: "active", created_at: new Date() },
        },
        upsert: true,
      },
    });
  }

  console.log("Writing to DB...");
  const BATCH = 1000;
  for (let i = 0; i < ops.length; i += BATCH) {
    await Pincode.bulkWrite(ops.slice(i, i + BATCH));
    process.stdout.write(`\r${Math.min(i + BATCH, ops.length)}/${ops.length}`);
  }
  console.log();

  console.log("\n=== Import summary ===");
  console.log(`Total pincodes:        ${byPincode.size}`);
  console.log(`Resolved city + state: ${resolvedBoth}`);
  console.log(`Resolved state only:   ${resolvedStateOnly}`);
  console.log(`Resolved neither:      ${resolvedNeither}`);
  if (unresolvedStates.size) {
    console.log("Unresolved source state names:", [...unresolvedStates]);
  }

  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
