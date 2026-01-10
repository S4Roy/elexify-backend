import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
dayjs.extend(utc);

// get current utc time
export const getCurrentUTCTime = async (format = "YYYY-MM-DD HH:mm:ss") => {
  const dateString = dayjs.utc().format(format);
  return dateString;
};
