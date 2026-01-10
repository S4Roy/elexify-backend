import Page from "../../../models/Page.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import HomePageResource from "../../../resources/HomePageResource.js";

/**
 * Page Content by Slug
 */
export const pageContent = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const matchFilter = { deleted_at: null, status: "active", slug };

    const pipeline = [
      { $match: matchFilter },

      // Lookup categories
      {
        $lookup: {
          from: "categories",
          localField: "extra.categories",
          foreignField: "_id",
          as: "categories",
        },
      },

      // Lookup media for each category.image
      {
        $lookup: {
          from: "medias",
          let: { imageIds: "$categories.image" },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", "$$imageIds"] } } },
            { $project: { url: 1, alt: 1 } },
          ],
          as: "categoryImages",
        },
      },

      // ✅ Enrich categories with products + child category counts
      {
        $lookup: {
          from: "categories",
          let: { catIds: "$categories._id" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$_id", "$$catIds"] },
                deleted_at: null,
              },
            },

            // Lookup product count
            {
              $lookup: {
                from: "products",
                let: { categoryId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $in: ["$$categoryId", "$categories"] },
                      deleted_at: null,
                    },
                  },
                  { $count: "count" },
                ],
                as: "products_count",
              },
            },
            {
              $addFields: {
                products: {
                  $cond: [
                    { $gt: [{ $size: "$products_count" }, 0] },
                    { $arrayElemAt: ["$products_count.count", 0] },
                    0,
                  ],
                },
              },
            },

            // Lookup child categories count
            {
              $lookup: {
                from: "categories",
                let: { parentId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$parent_category", "$$parentId"] },
                      status: "active", // ✅ only active categories
                      deleted_at: null, // ✅ not deleted
                    },
                  },
                  { $count: "count" },
                ],
                as: "child_categories_count",
              },
            },
            {
              $addFields: {
                has_children: {
                  $gt: [{ $size: "$child_categories_count" }, 0],
                },
                child_count: {
                  $cond: [
                    { $gt: [{ $size: "$child_categories_count" }, 0] },
                    { $arrayElemAt: ["$child_categories_count.count", 0] },
                    0,
                  ],
                },
              },
            },

            {
              $project: {
                products_count: 0,
                child_categories_count: 0,
              },
            },
          ],
          as: "categories",
        },
      },

      // Rebuild categories in the same order as extra.categories
      {
        $addFields: {
          categories: {
            $map: {
              input: { $range: [0, { $size: "$extra.categories" }] },
              as: "idx",
              in: {
                $let: {
                  vars: {
                    catId: { $arrayElemAt: ["$extra.categories", "$$idx"] },
                  },
                  in: {
                    $mergeObjects: [
                      {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$categories",
                              as: "cat",
                              cond: { $eq: ["$$cat._id", "$$catId"] },
                            },
                          },
                          0,
                        ],
                      },
                      {
                        image: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: "$categoryImages",
                                as: "img",
                                cond: {
                                  $eq: [
                                    "$$img._id",
                                    {
                                      $arrayElemAt: [
                                        {
                                          $map: {
                                            input: {
                                              $filter: {
                                                input: "$categories",
                                                as: "c",
                                                cond: {
                                                  $eq: ["$$c._id", "$$catId"],
                                                },
                                              },
                                            },
                                            as: "c",
                                            in: "$$c.image",
                                          },
                                        },
                                        0,
                                      ],
                                    },
                                  ],
                                },
                              },
                            },
                            0,
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },

      {
        $project: {
          title: 1,
          content: 1,
          status: 1,
          created_at: 1,
          categories: 1,
        },
      },
    ];

    let data = await Page.aggregate(pipeline);
    data = await new HomePageResource(data[0]).exec();

    res.status(200).json({
      status: "success",
      message: req.__(`Data fetched successfully`),
      data: data || {},
    });
  } catch (error) {
    next(error);
  }
};
