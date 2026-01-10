export const adminPasswordRule = (value) => {
  const upperCaseFormat = /^[A-Z]/;
  const ruleCheck =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&;=.”#’()+,-/:<>[\]\\^_`{|}~])[A-Za-z\d@$!%*?&;=.”#’()+,-/:<>[\]\\^_`{|}~]+$/;
  if (!upperCaseFormat.test(value)) {
    return "Password first letter must be uppercase.";
  } else if (!ruleCheck.test(value)) {
    return "Password must be combination of minimum 1 lowercase letter,1 special character,1 number and min length 8 characters & max length 30";
  }
  return true;
};
