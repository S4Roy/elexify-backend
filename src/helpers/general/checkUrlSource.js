export const checkUrlSource = async (url) => {
  let domain = "";
  const validDomains = ["youtube", "vimeo"];
  if (url) {
    // Remove protocol (http:// or https://) and www.
    domain = url.replace(/(^\w+:|^)\/\/(www\.)?/, "");
    // Extract the domain name (the part before the next '/')
    domain = !domain.split("/")[0] ? "" : domain.split("/")[0];
    // Remove the ".com" part
    domain = domain.replace(".com", "");
  }
  return domain && validDomains.includes(domain) ? domain : "";
};
