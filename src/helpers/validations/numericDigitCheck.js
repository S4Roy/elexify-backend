export const numericDigitCheck = (value) => {
  if (value) {
    if (typeof value != "string") {
      value = value.toSting();
    }
    const regEx = /^\d+$/;
    if (!regEx.test(value)) {
      return `numeric charecter are allow only`;
    }
  }
  return true;
};
