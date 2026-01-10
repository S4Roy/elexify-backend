import dayjs from "dayjs";

export const getCurrentTimeStamp = async () => {
  const currentDateTime = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const timestamp = dayjs(currentDateTime).valueOf();
  return timestamp;
};
