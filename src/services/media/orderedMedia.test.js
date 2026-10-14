import { expect, it } from "vitest";
import { inRequestedOrder, keepOrderOf, orderedMediaLookup } from "./orderedMedia.js";

it("keeps the requested order, dropping unknown and duplicate ids", () => {
  const found = [{ _id: "a" }, { _id: "b" }, { _id: "c" }]; // database order
  expect(inRequestedOrder(["c", "x", "a", "c", "b"], found)).toEqual(["c", "a", "b"]);
});

it("builds a medias lookup that sorts by position in the id array", () => {
  const { $lookup } = orderedMediaLookup({ localField: "product.images", as: "product_images" });
  expect($lookup).toMatchObject({ from: "medias", localField: "product.images", foreignField: "_id", let: { mediaIds: "$product.images" }, as: "product_images" });
  expect($lookup.pipeline).toEqual(keepOrderOf("$$mediaIds"));
  expect(keepOrderOf("$$ids")[0].$addFields.__media_order.$indexOfArray[1]).toBe("$_id");
});
