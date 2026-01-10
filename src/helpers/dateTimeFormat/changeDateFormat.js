import dayjs from "dayjs";

export const changeDateFormat = async (date, format = "ddd, MMM D, YYYY h:mm A") => {
  const dateString = dayjs(date).format(format);
  return dateString;
};
