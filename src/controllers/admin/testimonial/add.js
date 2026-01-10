import Testimonial from "../../../models/Testimonial.js";
import { StatusError } from "../../../config/index.js";

/**
 * Add or Update Testimonial by ID
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const {
      _id, // pass for update, skip for create
      name,
      designation,
      message,
      rating,
      image,
      source,
      status,
    } = req.body;

    if (_id) {
      // 🔹 Update
      const existingTestimonial = await Testimonial.findById(_id);
      if (!existingTestimonial) {
        throw StatusError.notFound("Testimonial not found.");
      }

      existingTestimonial.name = name || existingTestimonial.name;
      existingTestimonial.designation =
        designation || existingTestimonial.designation;
      existingTestimonial.message = message || existingTestimonial.message;
      existingTestimonial.rating = rating || existingTestimonial.rating;
      existingTestimonial.image = image || existingTestimonial.image;
      existingTestimonial.source = source || existingTestimonial.source;
      existingTestimonial.status = status || existingTestimonial.status;
      existingTestimonial.updated_by = req.auth?.user_id || null;
      existingTestimonial.updated_at = new Date();

      await existingTestimonial.save();

      return res.status(200).json({
        status: "success",
        message: req.__("Testimonial updated successfully"),
        data: existingTestimonial,
      });
    } else {
      // 🔹 Create
      const newTestimonial = new Testimonial({
        name,
        designation,
        message,
        rating,
        image,
        source,
        status,
        created_by: req.auth?.user_id || null,
        created_at: new Date(),
      });

      await newTestimonial.save();

      return res.status(201).json({
        status: "success",
        message: req.__("Testimonial added successfully"),
        data: newTestimonial,
      });
    }
  } catch (error) {
    console.error(error);
    next(error);
  }
};
