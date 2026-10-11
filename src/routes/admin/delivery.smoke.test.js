import { expect, it } from "vitest";
it("loads the delivery and order admin routers", async () => {
  const [{ deliveryRouter }, { orderRouter }] = await Promise.all([import("./delivery.js"), import("./inventory/order.js")]);
  const paths = (router) => router.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`);
  expect(paths(deliveryRouter)).toEqual(["get /mine", "post /:id/delivered", "post /:id/attempt"]);
  expect(paths(orderRouter)).toEqual(expect.arrayContaining(["get /delivery-staff", "get /package/:id/proof-photo"]));
}, 30_000); // importing the full order router graph is slow under suite load
