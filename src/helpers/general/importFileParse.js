import { Readable } from "stream";
import csv from "csv-parser";

export const importFileParse = async (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const results = [];

    Readable.from(fileBuffer)
      .pipe(csv())
      .on("data", (row) => results.push(row))
      .on("end", () => resolve(results))
      .on("error", (err) => reject(err));
  });
};
