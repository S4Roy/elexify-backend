import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
dayjs.extend(utc);

// convert date string to milliseconds
export const convertDateToMillisecond = async (dateString) => {
  const milliseconds = dayjs(dateString).valueOf();
  return milliseconds;
};
