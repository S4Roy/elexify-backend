export const handleError = (err, req, res, next) => {
  let message = req.__("serverError"); // Default message
  let status = err.statusCode || 500;

  if (err.code === "LIMIT_FILE_SIZE") {
    message = req.__("File size exceeds the allowed limit.");
    status = 400;
  } else if (err.code === "LIMIT_FILE_TYPE") {
    message = req.__("Invalid file type.");
    status = 400;
  } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
    message = req.__("Too many files uploaded.");
    status = 400;
  } else if (typeof err.message === "string") {
    message = err.message; // Use error message if available
    status = err.statusCode || 500;
  } else if (typeof err.message === "object") {
    message = JSON.stringify(err.message); // Convert object messages to string
    status = err.statusCode || 500;
  }

  res.status(status).json({ message: message, error: err });
};
