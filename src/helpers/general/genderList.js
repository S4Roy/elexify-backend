export const genderList = async (key = null) => {
  const listArr = {
    male: "Male",
    female: "Female",
  };

  if (key) {
    let retStr = "";
    if (listArr[key]) {
      retStr = listArr[key];
    }
    return retStr;
  } else {
    return listArr;
  }
};
