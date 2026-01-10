import { Router } from "express";
import { inventoryController } from "../../../controllers/site/index.js";
import { inventoryValidation } from "../../../validations/site/index.js";

const productRouter = Router();

productRouter.get(
  "/list",
  inventoryValidation.productValidation.list,
  inventoryController.productController.list
);

productRouter.get(
  "/details/:slug",
  inventoryValidation.productValidation.details,
  inventoryController.productController.details
);
productRouter.get(
  "/wishlist",
  inventoryValidation.productValidation.wishlist,
  inventoryController.productController.wishlist
);
productRouter.put(
  "/wishlist/toggle",
  inventoryValidation.productValidation.toggleWishList,
  inventoryController.productController.toggleWishList
);
productRouter.get(
  "/carts",
  inventoryValidation.productValidation.carts,
  inventoryController.productController.carts
);
productRouter.put(
  "/cart/manage",
  inventoryValidation.productValidation.cartManage,
  inventoryController.productController.cartManage
);
productRouter.get(
  "/common/counts",
  inventoryController.productController.counts
);
productRouter.get(
  "/filter-options",
  inventoryController.productController.filterOption
);
productRouter.get(
  "/customise-mala-attributes",
  inventoryController.productController.customiseMalaAttributes
);
productRouter.get(
  "/exchange-rate",
  inventoryController.productController.exchangeRate
);
productRouter.get(
  "/currency",
  inventoryController.productController.currencyList
);
productRouter.get(
  "/price-range",
  inventoryController.productController.priceRange
);
productRouter.get(
  "/specifications/:slug",
  inventoryController.productController.specifications
);
productRouter.get(
  "/temp-carts",
  inventoryValidation.productValidation.carts,
  inventoryController.productController.tempCarts
);
productRouter.put(
  "/temp-cart/manage",
  inventoryValidation.productValidation.cartManage,
  inventoryController.productController.tempCartManage
);
productRouter.post(
  "/customise-mala/cart",
  inventoryController.productController.customiseMalaCartManage
);

productRouter.post(
  "/enquiry",
  inventoryValidation.productValidation.enquiry,
  inventoryController.productController.enquiry
);

productRouter.post(
  "/cart/apply-coupon",
  inventoryController.productController.applyCoupon
);
export { productRouter };
