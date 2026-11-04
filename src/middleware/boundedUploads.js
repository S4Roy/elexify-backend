import fileUpload from "express-fileupload";

// Mount only AFTER authentication. Keep the buffer API used by existing media
// validation/S3 handlers, with an aggregate byte budget and process-wide gate.
export function createBoundedUploads({ maxBytes = 55 * 1024 * 1024, maxConcurrent = 2 } = {}) {
  let active = 0;
  const parse = fileUpload({
    limits: { fileSize: 50 * 1024 * 1024, files: 5, fields: 20, parts: 25, fieldSize: 64 * 1024 },
    abortOnLimit: true,
    uploadTimeout: 30_000,
    safeFileNames: true,
    preserveExtension: 5,
  });
  return (req, res, next) => {
    if (!req.is("multipart/form-data")) return next();
    const reject = (status, message) => {
      res.set("Connection", "close");
      res.status(status).json({ status: "error", message });
    };
    if (Number(req.headers["content-length"]) > maxBytes) return reject(413, "Upload request too large");
    if (active >= maxConcurrent) {
      res.set("Retry-After", "5");
      return reject(503, "Uploads are busy. Please retry shortly.");
    }
    active++;
    let released = false;
    let rejected = false;
    let bytes = 0;
    const release = () => {
      if (released) return;
      released = true;
      active--;
      clearTimeout(timer);
      req.removeListener("data", count);
    };
    const abort = (status, message) => {
      if (rejected || res.writableEnded) return;
      rejected = true;
      req.unpipe();
      res.once("finish", () => req.destroy());
      reject(status, message);
    };
    const count = chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) abort(413, "Upload request too large");
    };
    const timer = setTimeout(() => abort(408, "Upload timed out"), 60_000);
    timer.unref();
    // Retain the gate through image/video processing, not just body parsing.
    res.once("finish", release);
    res.once("close", release);
    req.prependListener("data", count);
    parse(req, res, error => { if (!rejected && !res.writableEnded) next(error); });
  };
}

export const boundedUploads = createBoundedUploads();
