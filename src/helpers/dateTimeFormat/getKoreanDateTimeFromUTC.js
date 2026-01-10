import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

// get korean time
export const getKoreanDateTimeFromUTC = async (date, format = "YYYY-MM-DD HH:mm:ss") => {
  dayjs.extend(utc);
  dayjs.extend(timezone);
  const utcDatetime = dayjs.utc(date);
  // Convert to Korean timezone (Asia/Seoul)
  const koreanDatetime = utcDatetime.tz("Asia/Seoul");
  const dateString = koreanDatetime.format(format);
  return dateString;
};
