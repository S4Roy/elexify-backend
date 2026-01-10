import dayjs from "dayjs";

export const calculateDifferentBetweenDate = async (startDate, endDate, differType = "second") => {
  let dateString = "";
  if (startDate && endDate) {
    let date1 = dayjs(startDate);
    let date2 = dayjs(endDate);
    let differ = date2.diff(date1, differType);
    if (differ) {
      dateString = differ;
    }
  }
  return dateString;
};
