import dayjs from "dayjs";

export const checkDateFormat = async (date, format = "YYYY-MM-DD") => {
  const dateString = dayjs(date).format(format);
  return dateString == date ? true : false;
};
