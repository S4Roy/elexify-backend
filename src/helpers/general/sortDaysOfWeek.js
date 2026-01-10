export const sortDaysOfWeek = async (dayList = []) => {
  const daysOfWeekOrder = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  if (dayList.length > 0) {
    return dayList.sort((a, b) => {
      const dayOfWeekA = daysOfWeekOrder.indexOf(a);
      const dayOfWeekB = daysOfWeekOrder.indexOf(b);

      if (dayOfWeekA < dayOfWeekB) {
        return -1;
      } else if (dayOfWeekA > dayOfWeekB) {
        return 1;
      } else {
        return 0; // Days have the same position in the week
      }
    });
  } else {
    return [];
  }
};
