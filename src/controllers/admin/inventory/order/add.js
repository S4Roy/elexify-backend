import Product from '../../../../models/Product.js';
import ProductVariation from '../../../../models/ProductVariation.js';
import User from '../../../../models/User.js';
import Address from '../../../../models/Address.js';
import { StatusError } from '../../../../config/index.js';
import { add as checkout } from '../../../site/inventory/order/add.js';

export async function loadAdminItems(lines) {
  const seen = new Set();
  return Promise.all(lines.map(async (line) => {
    const key = `${line.product_id}:${line.variation_id || ''}`;
    if (seen.has(key)) throw StatusError.badRequest('Combine duplicate products into one line.');
    seen.add(key);
    const product = await Product.findOne({ _id: line.product_id, status: 'active', deleted_at: null });
    if (!product) throw StatusError.badRequest('Product is no longer available.');
    const variation = line.variation_id ? await ProductVariation.findOne({
      _id: line.variation_id, product_id: product._id, status: 'active', deleted_at: null,
    }) : null;
    if ((line.variation_id && !variation) || (product.type === 'variable' && !variation)) {
      throw StatusError.badRequest('Select an available product variation.');
    }
    if (product.ask_for_price || variation?.ask_for_price) throw StatusError.badRequest('This product requires a price enquiry.');
    return { product, variation, quantity: line.quantity };
  }));
}

export const add = async (req, res, next) => {
  try {
    const customer = await User.findOne({ _id: req.body.customer_id, role: 'customer', status: 'active', deleted_at: null });
    if (!customer) throw StatusError.badRequest('Select an active customer.');
    const checkoutReq = Object.create(req);
    checkoutReq.auth = { user_id: customer._id };
    checkoutReq.body = { ...req.body, currency: 'INR', idempotency_key: `admin:${req.body.idempotency_key}` };
    return checkout(checkoutReq, res, next, {
      actor: req.auth.user_id, quote: req.path === '/quote',
      loadItems: () => loadAdminItems(req.body.items),
    });
  } catch (error) { next(error); }
};

export const createOptions = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const active = { status: 'active', deleted_at: null };
    let data;
    if (req.query.customer_id && req.query.kind !== 'customers') {
      data = await Address.find({ ...active, user: req.query.customer_id }).select('full_name phone address_line_1 address_line_2 city_name state_name postcode').limit(50).lean();
    } else if (req.query.kind === 'customers') {
      data = await User.find({ ...active, role: 'customer', ...(req.query.customer_id ? { _id: req.query.customer_id } : {}), $or: [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }, { mobile: new RegExp(search, 'i') }] }).select('name email mobile').limit(20).lean();
    } else {
      const matchingVariants = search ? await ProductVariation.find({ ...active, sku: new RegExp(search, 'i') }).select('product_id').limit(20).lean() : [];
      const products = await Product.find({ ...active, $or: [{ name: new RegExp(search, 'i') }, { sku: new RegExp(search, 'i') }, { _id: { $in: matchingVariants.map(v => v.product_id) } }] }).select('name sku type stock_quantity regular_price sale_price').limit(20).lean();
      const variations = await ProductVariation.find({ ...active, product_id: { $in: products.map(p => p._id) } }).select('product_id combination_key sku stock_quantity regular_price sale_price').lean();
      data = products.flatMap(p => p.type === 'variable'
        ? variations.filter(v => String(v.product_id) === String(p._id)).map(v => ({ ...v, product_id: p._id, variation_id: v._id, name: `${p.name} — ${v.combination_key}` }))
        : [{ ...p, product_id: p._id, variation_id: null }]);
    }
    res.json({ status: 'success', data });
  } catch (error) { next(error); }
};
