import dayjs from "dayjs";

// convert timestamp to datetime format
export const convertTimestampToDateTime = async (timestamp) => {
  const dateString = dayjs(parseInt(timestamp)).format("YYYY-MM-DD HH:mm:ss");
  return dateString;
};
