import Resource from "resources.js";
import { envs } from "../config/index.js";
import MediaResource from "./MediaResource.js";
import UserResource from "./UserResource.js";

class CategoryResource extends Resource {
  _mapBlock(block = {}) {
    // if no block provided, return defaults
    const blk = block || {};

    // Resolve image and bg resources (if populated as doc, MediaResource will handle it;
    // if not populated, MediaResource should handle null gracefully)
    const imageRes = blk.image
      ? new MediaResource(blk.image).exec()
      : { url: envs.NO_IMAGE };
    const bgRes = blk.bg ? new MediaResource(blk.bg).exec() : null;

    return {
      title: blk.title ?? null,
      heading: blk.heading ?? null,
      description: blk.description ?? null,
      ruling_planet: blk.ruling_planet ?? null,
      lord_deity: blk.lord_deity ?? null,
      chakra_activated: blk.chakra_activated ?? null,
      beej_mantra: blk.beej_mantra ?? null,
      recommended_chalisa: blk.recommended_chalisa ?? null,
      energization_procedure: blk.energization_procedure ?? null,

      external_url: blk.external_url ?? null,

      // full media object (or fallback object with url)
      image: imageRes,
      // bg may be null when not provided — keep both object and url
      bg: bgRes ?? null,
    };
  }

  toArray() {
    const details = this.details || {};

    // build details object with expected blocks (block_1..block_8)
    const mappedDetails = {
      required: details.required,
      block_1: this._mapBlock(details.block_1),
      block_2: this._mapBlock(details.block_2),
      block_3: details.block_3,
      block_4: this._mapBlock(details.block_4),
      block_5: this._mapBlock(details.block_5),
      block_6: this._mapBlock(details.block_6),
      block_7: this._mapBlock(details.block_7),
      block_8: this._mapBlock(details.block_8),
    };

    const doc = {
      _id: this._id || null,
      slug: this.slug || null,
      name: this.name || null,
      description: this.description || null,
      banner_tag_line: this.banner_tag_line || null,
      status: this.status || null,
      products: this.products || 0,
      child_count: this.child_count ?? null,
      has_children: this.has_children ?? 0,
      parent_category: this.parent_category
        ? new CategoryResource(this.parent_category).exec()
        : null,
      image: this.image
        ? new MediaResource(this.image).exec()
        : { url: envs.NO_IMAGE },
      banner: this.banner
        ? new MediaResource(this.banner).exec()
        : { url: envs.NO_IMAGE },

      // mapped details
      details: mappedDetails,

      updated_at: this.updated_at || null,
      created_at: this.created_at || null,
      created_by: this.created_by
        ? new UserResource(this.created_by).exec()
        : null,
      updated_by: this.updated_by
        ? new UserResource(this.updated_by).exec()
        : null,
    };

    return doc;
  }
}

export default CategoryResource;
