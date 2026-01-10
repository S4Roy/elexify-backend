import path from "path";
import sanitizeHtml from "sanitize-html";

import Blog from "../../../models/Blog.js";
import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import BlogResource from "../../../resources/BlogResource.js";
import { generalHelper } from "../../../helpers/index.js";
import { s3Handler } from "../../../services/s3Handler/s3Handler.js"; // optional - adjust if missing

/**
 * Edit Blog (simple, no transactions)
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const {
      _id,
      title,
      short_description,
      content,
      status,
      tags,
      category,
      seo,
      related_blogs,
      cta_label,
      cta_link,
      feature_image: featureImageBody, // may be id or object
    } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Blog ID is required"));
    }

    // Load existing blog
    const blog = await Blog.findById(_id).exec();
    if (!blog) {
      throw StatusError.notFound(req.__("Blog not found"));
    }

    const updateData = {
      updated_by: req.auth?.user_id ?? null,
    };

    // Title & slug handling
    if (title !== undefined) {
      const cleanedTitle = String(title || "").trim();
      if (!cleanedTitle) {
        throw StatusError.badRequest(req.__("Title is required"));
      }

      if (cleanedTitle !== blog.title) {
        // generate unique slug
        const baseSlug = generalHelper.generateSlugName(cleanedTitle);
        let slug = baseSlug;
        let existing = await Blog.findOne({ slug }).exec();
        let suffix = 1;
        const MAX_ATTEMPTS = 1000;
        while (
          existing &&
          String(existing._id) !== String(blog._id) &&
          suffix <= MAX_ATTEMPTS
        ) {
          slug = `${baseSlug}-${suffix}`;
          existing = await Blog.findOne({ slug }).exec();
          suffix++;
        }
        if (existing && String(existing._id) !== String(blog._id)) {
          slug = `${baseSlug}-${Date.now()}`;
        }
        updateData.title = cleanedTitle;
        updateData.slug = slug;
      }
    }

    if (short_description !== undefined) {
      updateData.short_description = short_description || "";
    }
    if (status !== undefined) {
      updateData.status = status;
    }

    // sanitize content (if provided)
    if (content !== undefined) {
      const sanitizedContent = sanitizeHtml(String(content || ""), {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          "img",
          "table",
          "thead",
          "tbody",
          "tr",
          "td",
          "th",
        ]),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          img: ["src", "alt", "title", "width", "height"],
          a: ["href", "name", "target", "rel"],
        },
      });
      updateData.content = content;
    }

    // Tags
    if (tags !== undefined) {
      if (typeof tags === "string") {
        updateData.tags = tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      } else if (Array.isArray(tags)) {
        updateData.tags = tags.map((t) => String(t).trim()).filter(Boolean);
      } else {
        updateData.tags = [];
      }
    }

    if (related_blogs !== undefined) {
      updateData.related_blogs = related_blogs || [];
    }
    if (category !== undefined) {
      updateData.category = category || null;
    }

    if (seo !== undefined) {
      updateData.seo = {
        meta_title: seo?.meta_title ?? blog.seo?.meta_title ?? "",
        meta_description:
          seo?.meta_description ?? blog.seo?.meta_description ?? "",
        meta_keywords: seo?.meta_keywords ?? blog.seo?.meta_keywords ?? [],
        canonical: seo?.canonical ?? blog.seo?.canonical ?? "",
      };
    }

    if (cta_label !== undefined) updateData.cta_label = cta_label || "";
    if (cta_link !== undefined) updateData.cta_link = cta_link || null;

    // Media handling (feature image)
    // 1) uploaded file via req.files.feature_image
    // 2) or existing media id/object passed in body feature_image
    const imageInput = req?.files?.feature_image ?? req?.files?.image ?? null;
    const imageFile = Array.isArray(imageInput) ? imageInput[0] : imageInput;

    if (imageFile) {
      // Upload provided file to S3 (if s3Handler present), else skip upload and store original filename
      const originalName =
        imageFile.name || imageFile.originalname || "feature-image";
      const ext = path.extname(originalName).toLowerCase();
      const baseTitle = (updateData.title || blog.title || "blog").toString();
      const safeTitle = generalHelper?.slugify
        ? generalHelper.slugify(baseTitle)
        : String(baseTitle)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");

      const key = `blogs/${safeTitle}-${Date.now()}${ext}`;

      let uploadResult = null;
      if (s3Handler && typeof s3Handler.uploadToS3 === "function") {
        uploadResult = await s3Handler.uploadToS3(imageFile, key);
      } else {
        // fallback: keep the key as stored value; you may prefer to save a local path
        uploadResult = { key, url: key };
      }

      // create new Media doc
      const media = new Media({
        reference_id: blog._id,
        reference_type: "blogs",
        alt_text: baseTitle,
        url: uploadResult.key ?? uploadResult.url ?? key,
        public_url: uploadResult.url ?? null,
        type: "image",
        status: "active",
        created_by: req.auth?.user_id ?? null,
      });
      await media.save();

      updateData.feature_image = media._id;
    } else if (
      featureImageBody !== undefined &&
      featureImageBody !== null &&
      featureImageBody !== ""
    ) {
      // Accept either string id or object with _id
      let newMediaId = null;
      if (typeof featureImageBody === "string") newMediaId = featureImageBody;
      else if (featureImageBody && featureImageBody._id)
        newMediaId = featureImageBody._id;

      if (newMediaId) {
        updateData.feature_image = newMediaId;
        // Back-reference the chosen media to this blog (set reference_id)
        await Media.updateOne(
          { _id: newMediaId },
          { $set: { reference_id: blog._id } }
        ).exec();
      } else if (featureImageBody === null || featureImageBody === "") {
        updateData.feature_image = null;
      }
    }

    // Apply update
    const updated = await Blog.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    ).exec();

    // If update included a new feature_image id, ensure media's reference_id points to blog (best-effort)
    if (updateData.feature_image) {
      await Media.updateOne(
        { _id: updateData.feature_image },
        { $set: { reference_id: updated._id } }
      ).exec();
    }

    res.status(200).json({
      status: "success",
      message: req.__("Blog updated successfully"),
      data: new BlogResource(updated).exec(),
    });
  } catch (error) {
    next(error);
  }
};
