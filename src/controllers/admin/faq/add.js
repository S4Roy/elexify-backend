import FAQ from "../../../models/FAQ.js";
import { StatusError } from "../../../config/index.js";

/**
 * Add or Update FAQ by ID
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const {
      _id, // pass for update, skip for create
      question,
      answer,
      status,
    } = req.body;

    if (_id) {
      // 🔹 Update
      const existingFaq = await FAQ.findById(_id);
      if (!existingFaq) {
        throw StatusError.notFound("FAQ not found.");
      }

      existingFaq.question = question || existingFaq.question;
      existingFaq.answer = answer || existingFaq.answer;
      existingFaq.status = status || existingFaq.status;
      existingFaq.updated_by = req.auth?.user_id || null;
      existingFaq.updated_at = new Date();

      await existingFaq.save();

      return res.status(200).json({
        status: "success",
        message: req.__("FAQ updated successfully"),
        data: existingFaq,
      });
    } else {
      // 🔹 Create
      const newFaq = new FAQ({
        question,
        answer,
        status,
        created_by: req.auth?.user_id || null,
        created_at: new Date(),
      });

      await newFaq.save();

      return res.status(201).json({
        status: "success",
        message: req.__("FAQ added successfully"),
        data: newFaq,
      });
    }
  } catch (error) {
    console.error(error);
    next(error);
  }
};
