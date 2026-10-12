import morgan from "morgan";
import moment from "moment-timezone";
import { STORE_TIMEZONE } from "./storeTime.js";
import split2 from "split2";
import { createLogger, format, transports } from "winston";

const logger = createLogger({
  transports: [
    new transports.Console({
      format: format.combine(
        // IST, whatever the server timezone (config/storeTime.js).
        format.timestamp({ format: () => moment().tz(STORE_TIMEZONE).format("MMM-DD-YYYY HH:mm:ss") }),
        format.json()
      ),
    }),
    // new transports.File({
    //   filename: "logs/access.log",
    //   format: format.combine(format.timestamp({ format: "MMM-DD-YYYY HH:mm:ss" }), format.json()),
    // }),
  ],
  exitOnError: false,
});

morgan.token("content", (req, res) => {
  if (!res.statusCode) {
    return "-";
  }
  if (res.statusCode < 400) {
    return res.get("content-length");
  }

  return res.locals.error || "-";
});

const morganFormat = ":method :url :status :content - :response-time ms";
const stream = split2().on("data", (line) => logger.info(line));

logger.stream(stream);
const morganConf = morgan(morganFormat, { stream });

export { logger, morganConf };
