export const packageReference = (orderId, packageNumber) => {
  if (!orderId || !Number.isInteger(Number(packageNumber)) || Number(packageNumber) < 1) return null;
  return `${String(orderId)}-P${Number(packageNumber)}`;
};
