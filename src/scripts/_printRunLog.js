// Prints a seedRunner.js `{ logs, summary }` result to the console in a
// consistent `[timestamp] [LEVEL] scriptName: message` shape, matched by
// what the admin panel's "Run Seed" log viewer renders for the same data.
export const printRunLog = (scriptName, logs, summary) => {
  for (const { timestamp, level, message } of logs) {
    console.log(`[${timestamp}] [${level}] ${scriptName}: ${message}`);
  }
  console.log(`[${scriptName}] summary: ${JSON.stringify(summary)}`);
};
