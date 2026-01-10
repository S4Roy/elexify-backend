export const getRoleNameByKey = async (key) => {
  let result = "";
  if (key) {
    // Split the text into words based on underscores and other non-alphabet characters
    const words = key.split(/[_\s]+/);

    // Capitalize the first letter of each word
    const capitalizedWords = words.map((word) => {
      return word.charAt(0).toUpperCase() + word.slice(1);
    });

    // Join the capitalized words back together with spaces
    result = capitalizedWords.join(" ");
  }
  return result;
};
