export const chartArrayFormat = (data) => {
  let resArray = [];
  const monthArray = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  monthArray.map((mnth, index) => {
    let flag = 0;
    Object.entries(data).forEach(([key, value]) => {
      if (mnth == value.month) {
        flag = value.count;
      }
    });
    resArray.push({ month: mnth, count: flag });
  });
  return resArray;
};
