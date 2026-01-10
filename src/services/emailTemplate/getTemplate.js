import EmailTemplate from "../../models/EmailTemplate.js"; // Assuming your MongoDB model

/**
 * Get Email Template
 * @param {String} type - The action type of the email template
 * @param {String} language - The site language of the email template
 * @returns {Object|null} - Returns the email template or null if not found
 */
export const getTemplate = async (type, language) => {
  try {
    const result = await EmailTemplate.findOne({
      action: type,
      site_language: language,
      status: "active",
    }).lean(); // .lean() for better performance (returns plain object)

    return result;
  } catch (error) {
    console.error("Error fetching email template:", error);
    return null;
  }
};
