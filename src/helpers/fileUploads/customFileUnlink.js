function customFileUnlink(fs, path) {
  if (fs && path) {
    fs.unlink(path, function () {});
  }
}
export { customFileUnlink };
