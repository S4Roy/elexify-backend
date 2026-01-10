import dayjs from "dayjs";

export const getDateFromCurrentDate = async (
  type,
  differ,
  differType,
  dateInput,
  format = "YYYY-MM-DD HH:mm:ss",
) => {
  let dateString = "";
  if (type == "add") {
    if (dateInput && dateInput != "" && dateInput != null && dateInput != "undefined") {
      dateString = dayjs(dateInput).add(differ, differType).format(format);
    } else {
      dateString = dayjs().add(differ, differType).format(format);
    }
  } else {
    if (dateInput && dateInput != "" && dateInput != null && dateInput != "undefined") {
      dateString = dayjs(dateInput).subtract(differ, differType).format(format);
    } else {
      dateString = dayjs().subtract(differ, differType).format(format);
    }
  }

  return dateString;
};
