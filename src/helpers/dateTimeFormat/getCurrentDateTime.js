import dayjs from "dayjs";

export const getCurrentDateTime = async (format = "YYYY-MM-DD HH:mm:ss") => {
  const dateString = dayjs().format(format);
  return dateString;
};
