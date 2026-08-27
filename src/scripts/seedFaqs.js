/**
 * Seeds the initial ecommerce FAQ set (Orders, Shipping & Delivery,
 * Payments, Returns & Refunds, Account, Products) so /faq has real content
 * instead of the empty state. Idempotent — a no-op once any active FAQ
 * already exists. Safe to re-run.
 *
 * Usage:
 *   node src/scripts/seedFaqs.js
 */
import mongoose from "../config/mongoose.js";
import FAQ from "../models/FAQ.js";

const faqs = [
  // Orders
  {
    category: "Orders",
    question: "How can I place an order?",
    answer:
      "<p>Browse our products, select the item or variation you want, and add it to your cart or use <strong>Buy Now</strong>. Choose your delivery address, review your order, and complete payment to confirm it.</p>",
  },
  {
    category: "Orders",
    question: "How can I check my order status?",
    answer:
      "<p>Log in to your account and open <strong>My Orders</strong> to see the latest status and delivery progress for every order you've placed.</p>",
  },
  {
    category: "Orders",
    question: "Can I modify my order after placing it?",
    answer:
      "<p>Order changes depend on how far the order has progressed. Please contact our support team as soon as possible after placing the order and we'll help wherever it's still possible.</p>",
  },
  {
    category: "Orders",
    question: "Can I cancel my order?",
    answer:
      '<p>Cancellation is available as long as the order hasn\'t shipped yet. Once it ships, it can no longer be cancelled — see our <a href="/page/refund-policy">Refund &amp; Cancellation Policy</a> for full details.</p>',
  },

  // Shipping & Delivery
  {
    category: "Shipping & Delivery",
    question: "How do I check whether delivery is available at my location?",
    answer:
      "<p>Enter your delivery pincode on the product page to instantly check serviceability and see the estimated delivery timeline for your area.</p>",
  },
  {
    category: "Shipping & Delivery",
    question: "How long does delivery take?",
    answer:
      "<p>Delivery timelines depend on your location, product availability, and the courier handling the shipment. Where available, we show the estimated delivery date on the product and checkout pages.</p>",
  },
  {
    category: "Shipping & Delivery",
    question: "How can I track my order?",
    answer:
      "<p>Once your order is dispatched, tracking details become available under <strong>My Orders</strong> in your account.</p>",
  },
  {
    category: "Shipping & Delivery",
    question: "What happens if my pincode is not serviceable?",
    answer:
      "<p>If we can't currently deliver to your pincode, you'll see a message on the product page. You can try a different address or check back later as we expand our delivery network.</p>",
  },

  // Payments
  {
    category: "Payments",
    question: "What payment methods do you accept?",
    answer:
      "<p>We support the payment options shown at checkout, which may include online payment, UPI, and debit/credit cards, depending on what's currently enabled.</p>",
  },
  {
    category: "Payments",
    question: "Is online payment secure?",
    answer:
      "<p>Yes. All payments are processed through our secure, encrypted payment gateway, and we never store your card details on our servers.</p>",
  },
  {
    category: "Payments",
    question: "What should I do if payment fails but money is deducted?",
    answer:
      "<p>First check your order and payment status under <strong>My Orders</strong>. If the amount isn't automatically refunded or the order isn't confirmed within a reasonable time, please contact our support team with your transaction details.</p>",
  },

  // Returns & Refunds
  {
    category: "Returns & Refunds",
    question: "Can I return a product?",
    answer:
      '<p>Yes, eligible products can be returned within 2 days of delivery if they arrive defective, damaged, or incorrect. See our <a href="/page/refund-policy">Refund &amp; Cancellation Policy</a> for full eligibility details.</p>',
  },
  {
    category: "Returns & Refunds",
    question: "How will I receive my refund?",
    answer:
      '<p>Approved refunds are credited back to your original payment method, in line with our <a href="/page/refund-policy">Refund &amp; Cancellation Policy</a>.</p>',
  },
  {
    category: "Returns & Refunds",
    question: "How long does a refund take?",
    answer:
      "<p>Refunds are processed within 5–7 working days after we receive and inspect the returned item.</p>",
  },
  {
    category: "Returns & Refunds",
    question: "Are shipping charges refundable?",
    answer:
      '<p>Refund conditions on shipping charges follow our <a href="/page/refund-policy">Refund &amp; Cancellation Policy</a>. Please refer to that page or contact support for the conditions that apply to your order.</p>',
  },

  // Account
  {
    category: "Account",
    question: "Do I need an account to place an order?",
    answer:
      "<p>You'll need to sign in or create an account to check out. This lets you track your orders, save addresses, and view your order history.</p>",
  },
  {
    category: "Account",
    question: "How can I update my delivery address?",
    answer:
      "<p>Go to <strong>My Account &gt; Addresses</strong> to add, edit, or remove saved addresses, or add a new one directly during checkout.</p>",
  },
  {
    category: "Account",
    question: "How can I reset my password?",
    answer:
      "<p>Use the <strong>Forgot Password</strong> link on the login page and follow the verification steps sent to your email or phone to set a new password.</p>",
  },

  // Products
  {
    category: "Products",
    question: "How do I know whether a product is in stock?",
    answer:
      "<p>Product pages show live stock availability, so you'll always see whether an item is in stock, low in stock, or currently unavailable.</p>",
  },
  {
    category: "Products",
    question: "Can product prices change?",
    answer:
      "<p>Yes, prices can change based on offers and availability. The final price is always confirmed at checkout before you complete your order.</p>",
  },
  {
    category: "Products",
    question: "How can I find products quickly?",
    answer:
      "<p>Use the search bar, browse by category, apply filters, or check our suggested and recently viewed products to quickly find what you're looking for.</p>",
  },
].map((faq, index) => ({ ...faq, order: index, status: "active" }));

const run = async () => {
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once("open", resolve);
      mongoose.connection.once("error", reject);
    });
  }

  const existing = await FAQ.countDocuments({ deleted_at: null });
  if (existing > 0) {
    console.log(`FAQs already has ${existing} active item(s) — nothing to seed.`);
    process.exit(0);
  }

  await FAQ.insertMany(faqs);
  console.log(`Seeded ${faqs.length} FAQ items.`);
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
