import Rating from "../../../models/Rating.js";
import Product from "../../../models/Product.js";
import ProductVariation from "../../../models/ProductVariation.js";
import mongoose from "mongoose";

// ✅ Add / Update Rating
export const add = async (req, res) => {
  try {
    const {
      product_id,
      variation_id = null, // normalize always
      rating,
      title,
      description,
      media = [],
    } = req.body;
    const userId = req.auth.user_id; // from auth middleware

    if (!rating || rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ message: "Rating must be between 1 and 5" });
    }

    // ✅ Find existing review
    let review = await Rating.findOne({
      user: userId,
      product_id,
      variation_id,
    });

    let created = false;

    if (review) {
      // ✅ Update existing review
      review.rating = rating;
      review.title = title;
      review.description = description;
      review.media = media;
      review.updated_by = userId;
      review.updatedAt = new Date();
      await review.save();
    } else {
      // ✅ Create new review
      review = await Rating.create({
        user: userId,
        product_id,
        variation_id,
        rating,
        title,
        description,
        media,
        created_by: userId,
      });
      created = true;
    }

    // ✅ Update product's avg rating & total reviews
    const agg = await Rating.aggregate([
      { $match: { product_id, status: "approved" } },
      {
        $group: {
          _id: "$product_id",
          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    if (agg.length > 0) {
      await Product.findByIdAndUpdate(product_id, {
        avg_rating: agg[0].avgRating,
        total_reviews: agg[0].totalReviews,
      });
    }

    // ✅ Update variation-level averages (if applicable)
    if (variation_id) {
      const variationAgg = await Rating.aggregate([
        {
          $match: {
            product_id: new mongoose.Types.ObjectId(product_id),
            variation_id: new mongoose.Types.ObjectId(variation_id),
            status: "approved",
          },
        },
        {
          $group: {
            _id: "$variation_id",
            avgRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ]);
      console.log("Variation Aggregation:", variationAgg);

      if (variationAgg.length > 0) {
        await ProductVariation.findByIdAndUpdate(variation_id, {
          avg_rating: variationAgg[0].avgRating,
          total_reviews: variationAgg[0].totalReviews,
        });
      }
    }

    return res.status(created ? 201 : 200).json({
      message: created
        ? "Rating added successfully"
        : "Rating updated successfully",
      data: review,
    });
  } catch (err) {
    console.error("Add/Update Rating Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};
