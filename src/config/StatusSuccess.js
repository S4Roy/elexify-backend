export const StatusSuccess = function (req, res, next) {
  res.ok = function (data) {
    // var response = {
    //   status: 200,
    //   success: true,
    //   message: res.__("success"),
    //   data: data,
    // };
    return res.status(200).send(data);
  };
  next();
};
