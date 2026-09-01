import mongoose from "mongoose";
import crypto from "crypto";
import Cart from "../../../../models/Cart.js";
import TempCart from "../../../../models/TempCart.js";
import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import User from "../../../../models/User.js";
import Address from "../../../../models/Address.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import StockTransaction from "../../../../models/StockTransaction.js";
import Coupon from "../../../../models/Coupon.js";
import CouponUsage from "../../../../models/CouponUsage.js";
import ProviderOrderAttempt from "../../../../models/ProviderOrderAttempt.js";
import { StatusError } from "../../../../config/index.js";
import { createRazorpayOrder } from "../../../../services/paymentService/createRazorpayOrder.js";
import { createPayPalOrder } from "../../../../services/paymentService/createPayPalOrder.js";
import { validateCoupon } from "../../../../services/inventory/cart/validateCoupon.js";
import { calculateQuantityDiscount } from "../../../../services/inventory/cart/calculateQuantityDiscount.js";
import { calculateShippingRate } from "../../../../services/shipping/calculateShippingRate.js";
import { calculateDeliveryEstimate } from "../../../../services/shipping/calculateDeliveryEstimate.js";
import { calculateCodEligibility } from "../../../../services/shipping/calculateCodEligibility.js";
import { snapshotAddress } from "../../../../services/invoiceService/snapshotAddress.js";
import { getCompanySettings } from "../../../../services/invoiceService/getCompanySettings.js";
import { computeGst } from "../../../../services/invoiceService/computeGst.js";
import { reconcileProviderOrderAttempt } from "../../../../services/paymentService/reconcileProviderOrderAttempt.js";
import { recordOperationalEvent } from "../../../../services/observability/recordOperationalEvent.js";
import { injectPlacementFault } from "../../../../services/orderService/injectPlacementFault.js";
import { notificationService } from "../../../../services/index.js";

export const add = async (req, res, next) => {
  let dbSession = null;
  let providerAttempt = null;
  let providerOrderCreated = false;
  let idempotencyKey = null;
  let requestFingerprint = null;
  try {
    const {
      currency = "INR",
      address_id,          // ✅ used to fetch the address
      payment_method,
      isDirectCheckout,
      coupon_code = null,
      idempotency_key,
      expected_total,
    } = req.body;
    idempotencyKey = idempotency_key;
    // ⚠️ Shipping is NEVER trusted from the client — it is always computed
    // server-side below from the resolved address + cart contents.

    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("Invalid access token.");
    }

    // Order placement is authenticated-only. Enforce this before reading a
    // guest cart so an expired session consistently returns 401 instead of a
    // misleading "No items found" response.
    if (!user_id) {
      throw StatusError.unauthorized("Login required to place an order.");
    }

    if (!address_id) {
      throw StatusError.badRequest("Delivery address is required.");
    }

    if (!payment_method) {
      throw StatusError.badRequest("Payment method is required.");
    }

    // This fingerprint intentionally describes the request envelope rather
    // than mutable cart/product state. A committed checkout clears its cart,
    // so replay detection must be possible before reading that cart. Prices,
    // stock and coupon eligibility are still rebuilt authoritatively for the
    // first execution below.
    requestFingerprint = crypto.createHash("sha256").update(JSON.stringify({
      user: String(user_id),
      address: String(address_id),
      payment_method,
      currency,
      coupon_code: coupon_code || null,
      isDirectCheckout: Boolean(isDirectCheckout),
      expected_total: expected_total == null ? null : Number(expected_total),
    })).digest("hex");

    const replayedOrder = await Order.findOne({ user: user_id, idempotency_key: idempotencyKey });
    if (replayedOrder) {
      if (
        replayedOrder.idempotency_fingerprint_version === 2 &&
        replayedOrder.idempotency_fingerprint !== requestFingerprint
      ) {
        throw StatusError.conflict("Idempotency key was already used for a different checkout request");
      }
      const providerOrderId = replayedOrder.payment_meta?.razorpay_order_id;
      return res.status(200).json({
        status: "success",
        message: "Order already placed",
        data: {
          order: replayedOrder,
          items: await OrderItem.find({ order_id: replayedOrder._id }),
          providerResponse: providerOrderId ? {
            provider: "razorpay",
            data: { id: providerOrderId, amount: Math.round(replayedOrder.grand_total * 100), currency: replayedOrder.currency },
          } : null,
        },
      });
    }

    // ── Exchange Rate ────────────────────────────────────────────────────────
    const ratesDoc = await ExchangeRate.findOne().sort({ updated_at: -1 });
    const exchangeRate = ratesDoc?.rates?.get(currency) ?? 1;

    // ── Fetch carts ──────────────────────────────────────────────────────────
    const carts = await (isDirectCheckout ? TempCart : Cart)
      .find({
        deleted_at: null,
        ...(user_id ? { user: user_id } : { guest_id }),
      })
      .populate("product variation customization_id");

    if (!carts.length) {
      throw StatusError.badRequest("No items found in cart.");
    }

    // ── Build order items ────────────────────────────────────────────────────
    let total = 0;

    const items = carts
      .map((cart) => {
        const product = cart.product;
        const variation = cart.variation;
        if (!product) return null;

        const quantity = Math.max(1, Number(cart.quantity) || 1);
        const stockSource = variation || product;
        const regularPrice = Number(stockSource.regular_price);
        const rawSalePrice = stockSource.sale_price;
        const salePrice = rawSalePrice == null || rawSalePrice === ""
          ? Number.NaN
          : Number(rawSalePrice);
        let base_unit_price =
          Number.isFinite(salePrice) && salePrice >= 0 && salePrice < regularPrice
            ? salePrice
            : regularPrice;
        let discountPercent = null;

        // Rebuild payable pricing from authoritative product/customization
        // records. Stored cart prices are display snapshots and may be stale.
        if (cart.customization_id?.total_price != null) {
          base_unit_price = Number(cart.customization_id.total_price);
        } else if (Array.isArray(product.quantity_discounts)) {
          const tier = calculateQuantityDiscount({
            basePrice: base_unit_price,
            quantity,
            tiers: product.quantity_discounts,
          });
          base_unit_price = tier.unitPrice;
          discountPercent = tier.discountPercent || null;
        }

        if (!Number.isFinite(base_unit_price) || base_unit_price < 0) {
          throw StatusError.badRequest("A product has an invalid current price.");
        }
        const base_total_price = base_unit_price * quantity;
        const unit_price = parseFloat((base_unit_price * exchangeRate).toFixed(2));
        const total_price = parseFloat((base_total_price * exchangeRate).toFixed(2));

        total += total_price;

        return {
          product_id: product._id,
          variation_id: variation?._id || null,
          customization_id: cart?.customization_id || null,
          quantity,
          unit_price,
          total_price,
          base_unit_price,
          base_total_price,
          shipping_class: stockSource.shipping_class || null,
          weight: stockSource.weight || 0,
          stock_quantity: stockSource.stock_quantity,
          status: stockSource.status,
          regular_price: parseFloat((regularPrice * exchangeRate).toFixed(2)),
          sale_price: base_unit_price < regularPrice ? unit_price : null,
          discount_percent: discountPercent,
          cart_ref: cart,
        };
      })
      .filter(Boolean);

    if (!items.length) {
      throw StatusError.badRequest("No valid products found in cart.");
    }

    // 🔹 Defensive re-check: bail if anything went out of stock between cart-add and checkout,
    // so we never confirm an order (or its delivery estimate) for unavailable items.
    const unavailableItem = items.find(
      (item) =>
        item.status === "inactive" ||
        (item.stock_quantity != null && item.stock_quantity < item.quantity)
    );
    if (unavailableItem) {
      throw StatusError.conflict("OUT_OF_STOCK");
    }

    // ── User ─────────────────────────────────────────────────────────────────
    const user = await User.findById(user_id);
    if (!user) throw StatusError.unauthorized("Invalid user session.");

    // ── Address — look up by address_id ──────────────────────────────────────
const address = await Address.findOne({
  _id: new mongoose.Types.ObjectId(address_id),
  user: user._id,
  deleted_at: null,
});

    if (!address) {
      throw StatusError.notFound("Address not found. Please select a valid delivery address.");
    }

    // ── Coupon ───────────────────────────────────────────────────────────────
    let discount = 0;

    if (coupon_code) {
      const couponData = await validateCoupon({
        code: coupon_code,
        user: { _id: user._id, role: user.role },
        carts: items.map((item) => ({
          ...item.cart_ref.toObject(),
          price: item.base_unit_price,
          discounted_price: null,
          product: item.cart_ref.product,
          variation: item.cart_ref.variation,
        })),
        currency,
      });
      discount = couponData.discount;
    }

    const discountAmount = parseFloat(discount.toFixed(2));
    const sub_total = parseFloat(total.toFixed(2));

    // ── Shipping + estimated delivery — computed server-side, never client-supplied ──────────
    const rateResult = await calculateShippingRate({
      items: items.map((item) => ({
        shipping_class: item.shipping_class,
        weight: item.weight,
        quantity: item.quantity,
      })),
      address: {
        country: address.country,
        state: address.state,
        postcode: address.postcode,
      },
      orderSubtotal: sub_total,
    });

    const shippingAmount = parseFloat(
      (rateResult.amount * exchangeRate).toFixed(2)
    );

    const deliveryEstimate = await calculateDeliveryEstimate({
      min_delivery_days: rateResult.min_delivery_days,
      max_delivery_days: rateResult.max_delivery_days,
      isAvailable: true,
    });

    const amountBeforePaymentFee = parseFloat(
      (sub_total - discountAmount + shippingAmount).toFixed(2),
    );
    let codFee = 0;
    if (payment_method === "cod") {
      const cod = await calculateCodEligibility({
        items: items.map((item) => ({
          product: item.cart_ref.product,
          variation: item.cart_ref.variation,
          customization_id: item.customization_id,
        })),
        address,
        orderAmount: amountBeforePaymentFee,
        user,
        zone: rateResult.zone,
        exchangeRate,
      });
      if (!cod.eligible) {
        throw StatusError.badRequest(cod.reason || "Cash on Delivery is unavailable for this order.");
      }
      codFee = cod.fee;
    }
    const grandTotal = parseFloat((amountBeforePaymentFee + codFee).toFixed(2));
    if (
      expected_total != null &&
      Math.abs(Number(expected_total) - grandTotal) > 0.009
    ) {
      throw StatusError.conflict(
        `CHECKOUT_TOTAL_CHANGED: total updated from ${Number(expected_total).toFixed(2)} to ${grandTotal.toFixed(2)}. Review the new total and retry.`,
      );
    }

    // ── Create order ─────────────────────────────────────────────────────────
    const order_id = `ORD-${crypto.createHash("sha256").update(`${user._id}:${idempotency_key}`).digest("hex").slice(0, 24).toUpperCase()}`;

    const existingOrder = await Order.findOne({ user: user._id, idempotency_key });
    if (existingOrder) {
      if (existingOrder.idempotency_fingerprint !== requestFingerprint) {
        throw StatusError.conflict("Idempotency key was already used for a different checkout request");
      }
      const providerOrderId = existingOrder.payment_meta?.razorpay_order_id;
      return res.status(200).json({
        status: "success",
        message: "Order already placed",
        data: {
          order: existingOrder,
          items: await OrderItem.find({ order_id: existingOrder._id }),
          providerResponse: providerOrderId ? {
            provider: "razorpay",
            data: { id: providerOrderId, amount: Math.round(existingOrder.grand_total * 100), currency: existingOrder.currency },
          } : null,
        },
      });
    }

    let preparedRazorpayOrder = null;
    if (payment_method === "razorpay") {
      let ownsProviderCreation = false;
      try {
        providerAttempt = await ProviderOrderAttempt.create({
          user: user._id,
          idempotency_key,
          request_fingerprint: requestFingerprint,
          local_order_id: order_id,
          provider: "razorpay",
          amount: grandTotal,
          currency,
        });
        ownsProviderCreation = true;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        providerAttempt = await ProviderOrderAttempt.findOne({ user: user._id, idempotency_key });
      }
      if (providerAttempt.request_fingerprint !== requestFingerprint) {
        throw StatusError.conflict("Idempotency key was already used for a different checkout request");
      }
      if (providerAttempt.provider_order_id) {
        preparedRazorpayOrder = {
          id: providerAttempt.provider_order_id,
          amount: Math.round(providerAttempt.amount * 100),
          currency: providerAttempt.currency,
          receipt: providerAttempt.local_order_id,
        };
      } else {
        if (!ownsProviderCreation) {
          const ageMs = Date.now() - new Date(providerAttempt.updated_at || providerAttempt.created_at).getTime();
          if (providerAttempt.status === "creating" && ageMs < 30_000) {
            throw StatusError.conflict("Checkout is already being placed; retry with the same idempotency key");
          }
          providerAttempt = await reconcileProviderOrderAttempt(providerAttempt._id);
          if (!providerAttempt?.provider_order_id) {
            throw StatusError.serviceUnavailable(
              "Payment order reconciliation is pending; retry this same checkout shortly",
            );
          }
          preparedRazorpayOrder = {
            id: providerAttempt.provider_order_id,
            amount: Math.round(providerAttempt.amount * 100),
            currency: providerAttempt.currency,
            receipt: providerAttempt.local_order_id,
          };
        } else {
          preparedRazorpayOrder = await createRazorpayOrder(grandTotal, currency, order_id);
          providerOrderCreated = true;
          // Test-only fault boundary for the irreducible provider/local
          // persistence gap. injectPlacementFault is inert unless NODE_ENV is
          // exactly "test" and the in-memory Express app local is installed.
          await injectPlacementFault(req, "after_provider_creation");
          await ProviderOrderAttempt.updateOne(
            { _id: providerAttempt._id, provider_order_id: null },
            { $set: { provider_order_id: preparedRazorpayOrder.id, status: "created", updated_at: new Date() } },
          );
        }
      }
    }

    await injectPlacementFault(req, "before_transaction");
    dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    const order = new Order({
      id: order_id,
      user: user._id,
      billing_address: address._id,
      shipping_address: address._id,
      billing_address_snapshot: snapshotAddress(address),
      shipping_address_snapshot: snapshotAddress(address),
      payment_status: "pending",
      order_status: payment_method === "cod" ? "confirmed" : "pending",
      total_amount: sub_total,
      discount: discountAmount,
      shipping: shippingAmount,
      cod_fee: codFee,
      grand_total: grandTotal,
      currency,
      payment_method,
      transaction_id: `EXT-${order_id}`,
      idempotency_key,
      idempotency_fingerprint: requestFingerprint,
      idempotency_fingerprint_version: 2,
      note: "Checkout",
      exchange_rate: exchangeRate,
      // Item count means purchasable units, not distinct order lines.
      total_items: items.reduce((sum, item) => sum + item.quantity, 0),
      coupon_code: coupon_code || null,
      etd: deliveryEstimate?.display || null,
    });
    await order.save({ session: dbSession });
    await injectPlacementFault(req, "order_creation");

    // ── Order items ──────────────────────────────────────────────────────────
    const company = await getCompanySettings();
    let allocatedCoupon = 0;
    let allocatedShipping = 0;
    const orderItems = items.map((item, index) => {
      const cart = item.cart_ref;
      const last = index === items.length - 1;
      const couponAllocation = last
        ? Number((discountAmount - allocatedCoupon).toFixed(2))
        : Number((sub_total > 0 ? discountAmount * item.total_price / sub_total : 0).toFixed(2));
      const shippingAllocation = last
        ? Number((shippingAmount - allocatedShipping).toFixed(2))
        : Number((sub_total > 0 ? shippingAmount * item.total_price / sub_total : 0).toFixed(2));
      allocatedCoupon += couponAllocation;
      allocatedShipping += shippingAllocation;
      const finalLineTotal = Number((item.total_price - couponAllocation + shippingAllocation).toFixed(2));
      const gst = computeGst({
        grandTotal: finalLineTotal,
        shippingState: address.state_name || address.state,
        company,
      });
      const regularLineTotal = Number((item.regular_price * item.quantity).toFixed(2));
      const productDiscount = Math.max(0, Number((regularLineTotal - item.total_price).toFixed(2)));
      return {
        order_id: order._id,
        product_id: item.product_id,
        variation_id: item.variation_id,
        customization_id: item.customization_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        regular_price: item.regular_price,
        sale_price: item.sale_price,
        discount_percent: item.discount_percent,
        currency,
        exchange_rate: exchangeRate,
        // Point-in-time snapshot — see OrderItem.js for why invoices must
        // never live-join product_id/variation_id for display.
        product_name: cart.product?.name || null,
        sku: cart.variation?.sku || cart.product?.sku || null,
        variation_name: cart.variation?.combination_key || null,
        base_unit_price: item.base_unit_price,
        base_line_total: item.base_total_price,
        sale_discount: item.discount_percent ? 0 : productDiscount,
        quantity_discount: item.discount_percent ? productDiscount : 0,
        coupon_discount: couponAllocation,
        taxable_amount: gst.taxableAmount,
        tax_rate: gst.taxRate,
        tax_amount: gst.taxAmount,
        cgst: gst.cgst,
        sgst: gst.sgst,
        igst: gst.igst,
        shipping_allocation: shippingAllocation,
        final_line_total: finalLineTotal,
      };
    });

    await OrderItem.insertMany(orderItems, { session: dbSession });
    await injectPlacementFault(req, "order_item_creation");

    // ── COD stock reservation ───────────────────────────────────────────────
    // COD orders have no separate payment-confirmation step (unlike
    // Razorpay/PayPal, which reserve stock in verifyPayment.js once payment
    // clears), so the order is fully accepted the moment it's placed — stock
    // must be decremented here, or a COD order never reserves inventory at all.
    if (payment_method === "cod") {
      for (const item of items) {
        if (item.variation_id) {
          const result = await ProductVariation.updateOne(
            { _id: item.variation_id, status: { $ne: "inactive" }, stock_quantity: { $gte: item.quantity } },
            { $inc: { stock_quantity: -item.quantity } },
            { session: dbSession },
          );
          if ((result.modifiedCount ?? result.nModified) !== 1) throw StatusError.conflict("OUT_OF_STOCK");
        } else {
          const result = await Product.updateOne(
            { _id: item.product_id, status: { $ne: "inactive" }, stock_quantity: { $gte: item.quantity } },
            { $inc: { stock_quantity: -item.quantity } },
            { session: dbSession },
          );
          if ((result.modifiedCount ?? result.nModified) !== 1) throw StatusError.conflict("OUT_OF_STOCK");
        }
        await injectPlacementFault(req, "stock_reservation");
        await StockTransaction.create([{
          product: item.product_id,
          variation: item.variation_id || null,
          type: "sale",
          quantity: item.quantity,
          reference_id: order._id,
          reference_type: "order",
          mrp: item.regular_price || 0,
          selling_price: item.unit_price || 0,
        }], { session: dbSession });
        await injectPlacementFault(req, "stock_ledger_creation");
      }
      await Order.updateOne({ _id: order._id }, { stock_reserved: true }, { session: dbSession });
      order.stock_reserved = true;

      if (coupon_code && discountAmount > 0 && user.email) {
        const coupon = await Coupon.findOne({ code: coupon_code }).session(dbSession);
        if (coupon) {
          const usage = await CouponUsage.updateOne(
            { order: order._id },
            { $setOnInsert: {
              coupon: coupon._id,
              user: user._id,
              email: user.email,
              order: order._id,
              discount_amount: discountAmount,
              currency,
            } },
            { upsert: true, session: dbSession },
          );
          if (usage.upserted?.length || usage.upsertedId) {
            await Coupon.updateOne(
              { _id: coupon._id },
              { $inc: { total_used: 1 } },
              { session: dbSession },
            );
          }
          await injectPlacementFault(req, "coupon_usage_creation");
        }
      }
    }

    // ── Cart cleanup ─────────────────────────────────────────────────────────
    if (isDirectCheckout) {
      await TempCart.deleteMany({
        deleted_at: null,
        ...(user_id ? { user: user_id } : { guest_id }),
      }).session(dbSession);
    } else {
      await Cart.updateMany(
        {
          deleted_at: null,
          ...(user_id ? { user: user_id } : { guest_id }),
        },
        { deleted_at: new Date() },
        { session: dbSession },
      );
    }
    await injectPlacementFault(req, "cart_mutation");

    // ── Payment ──────────────────────────────────────────────────────────────
    let providerResponse = null;

    if (payment_method === "razorpay") {
      await Order.findOneAndUpdate(
        { id: order_id },
        {
          payment_meta: {
            payment_provider: "razorpay",
            razorpay_order_id: preparedRazorpayOrder.id,
          },
        },
        { session: dbSession },
      );

      await ProviderOrderAttempt.updateOne(
        { _id: providerAttempt._id },
        { $set: { status: "linked", updated_at: new Date() } },
        { session: dbSession },
      );
      await injectPlacementFault(req, "provider_attempt_persistence");
      providerResponse = { provider: "razorpay", data: preparedRazorpayOrder };
    } else if (payment_method === "paypal") {
      const paypalResp = await createPayPalOrder(
        grandTotal,
        currency,
        order_id,
        items,
      );

      await Order.findOneAndUpdate(
        { id: order_id },
        {
          payment_meta: {
            payment_provider: "paypal",
            paypal_order_id: paypalResp.paypalOrderId,
          },
        },
        { session: dbSession },
      );

      providerResponse = { provider: "paypal", data: paypalResp };
    }

    await injectPlacementFault(req, "transaction_commit_boundary");
    await dbSession.commitTransaction();
    await dbSession.endSession();
    dbSession = null;
    await injectPlacementFault(req, "after_commit");

    // Fire-and-forget — the order is already committed; a notification
    // provider being slow/down must never affect this response.
    notificationService.sendOrderNotification({
      order,
      event: "ORDER_PLACED",
      dedupeKey: `${order.id}:ORDER_PLACED`,
    });

    // ── Response ─────────────────────────────────────────────────────────────
    return res.status(200).json({
      status: "success",
      message: "Order placed successfully",
      data: {
        order,
        items: orderItems,
        providerResponse,
      },
    });
  } catch (error) {
    const transactionWasOpen = Boolean(dbSession?.inTransaction());
    if (dbSession) {
      if (dbSession.inTransaction()) await dbSession.abortTransaction();
      await dbSession.endSession();
    }
    if (providerAttempt?._id && providerOrderCreated) {
      await ProviderOrderAttempt.updateOne(
        { _id: providerAttempt._id, status: { $ne: "linked" } },
        { $set: {
          status: "orphaned",
          last_error: String(error?.message || error).slice(0, 1000),
          updated_at: new Date(),
        } },
      ).catch(() => undefined);
      await recordOperationalEvent({
        eventType: "provider_attempt_orphaned", correlationId: providerAttempt.local_order_id,
        summary: "Provider order exists but the local checkout transaction failed",
        metadata: { attempt_id: providerAttempt._id, provider_order_id: providerAttempt.provider_order_id },
      }).catch(() => undefined);
    }
    if (transactionWasOpen) {
      await recordOperationalEvent({
        eventType: "transaction_aborted", correlationId: idempotencyKey,
        summary: "Order placement transaction aborted",
        metadata: { stage: "checkout", reason: error?.message },
      }).catch(() => undefined);
    }
    const isTransientTransactionError =
      error?.code === 112 ||
      error?.errorLabels?.includes?.("TransientTransactionError") ||
      /retry your operation or multi-document transaction/i.test(error?.message || "");
    if (isTransientTransactionError && (req._checkoutRetryCount || 0) < 2) {
      req._checkoutRetryCount = (req._checkoutRetryCount || 0) + 1;
      return add(req, res, next);
    }
    if (isTransientTransactionError) {
      return next(StatusError.serviceUnavailable(
        "Checkout temporarily conflicted with another request; retry with the same idempotency key",
      ));
    }
    if (error?.code === 11000 && idempotencyKey) {
      const existing = await Order.findOne({ user: req.auth?.user_id, idempotency_key: idempotencyKey });
      if (existing) {
        if (existing.idempotency_fingerprint !== requestFingerprint) {
          return next(StatusError.conflict("Idempotency key was already used for a different checkout request"));
        }
        return res.status(200).json({
          status: "success",
          message: "Order already placed",
          data: {
            order: existing,
            items: await OrderItem.find({ order_id: existing._id }),
            providerResponse: existing.payment_meta?.razorpay_order_id ? {
              provider: "razorpay",
              data: {
                id: existing.payment_meta.razorpay_order_id,
                amount: Math.round(existing.grand_total * 100),
                currency: existing.currency,
              },
            } : null,
          },
        });
      }
    }
    console.error("❌ Order creation failed:", error.message);
    next(error);
  }
};
