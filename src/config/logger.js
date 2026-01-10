import morgan from "morgan";
import split2 from "split2";
import { createLogger, format, transports } from "winston";

const logger = createLogger({
  transports: [
    new transports.Console({
      format: format.combine(
        format.timestamp({ format: "MMM-DD-YYYY HH:mm:ss" }),
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
