export class StatusError extends Error {
  statusCode;
  errorData;

  constructor(code, message) {
    // Ensure message is always a human-readable string
    const errorMessage =
      typeof message === "object" ? JSON.stringify(message) : message;

    super(errorMessage);
    this.statusCode = code;
    this.errorData = message; // Store the original message if it's an object
  }

  // Client Errors (4xx)
  static badRequest(message) {
    return new StatusError(400, message || "Bad Request");
  }

  static unauthorized(message) {
    return new StatusError(401, message || "Unauthorized Access");
  }

  static forbidden(message) {
    return new StatusError(403, message || "Forbidden: Access Denied");
  }

  static notFound(message) {
    return new StatusError(404, message || "Resource Not Found");
  }

  static methodNotAllowed(message) {
    return new StatusError(405, message || "Method Not Allowed");
  }

  static requestTimeout(message) {
    return new StatusError(408, message || "Request Timeout");
  }

  static conflict(message) {
    return new StatusError(409, message || "Conflict: Data Already Exists");
  }

  static unprocessableEntity(message) {
    return new StatusError(422, message || "Unprocessable Entity");
  }

  // Server Errors (5xx)
  static serverError(message) {
    return new StatusError(500, message || "Internal Server Error");
  }

  static notImplemented(message) {
    return new StatusError(501, message || "Not Implemented");
  }

  static badGateway(message) {
    return new StatusError(502, message || "Bad Gateway");
  }

  static serviceUnavailable(message) {
    return new StatusError(503, message || "Service Unavailable");
  }

  static gatewayTimeout(message) {
    return new StatusError(504, message || "Gateway Timeout");
  }

  static databaseError(message) {
    return new StatusError(520, message || "Database Error");
  }
}
