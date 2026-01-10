import dayjs from "dayjs";

export const getAllDatesBetween = async (startDate, endDate, type, format) => {
  const dateArray = [];
  let currentDate = dayjs(startDate);
  while (currentDate.format(format) <= dayjs(endDate).format(format)) {
    if (!dateArray.includes(currentDate.format(format))) dateArray.push(currentDate.format(format));
    currentDate = currentDate.add(1, type);
  }
  return dateArray;
};
