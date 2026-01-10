//  Get random numbers any length
export const getRandomNumbers = (length) => {
  return (
    Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)) +
    new Date().getTime()
  );
};
