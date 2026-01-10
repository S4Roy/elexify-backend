import dayjs from "dayjs";

export const changeTimeFormat = async (date) => {
  const dateString = dayjs(date).format("h:mm A");
  return dateString;
};
