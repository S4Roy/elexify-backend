import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';

// Parse phpMyAdmin INSERT values as data, never execute SQL. Reject expressions.
export function parseValues(text) {
  const rows = []; let i = 0;
  const ws = () => { while (/\s/.test(text[i] || '') && i < text.length) i++; };
  while (i < text.length) {
    ws(); if (text[i] === ';') { i++; ws(); if (i !== text.length) throw Error('Trailing SQL'); break; }
    if (text[i++] !== '(') throw Error('Unsupported SQL tuple');
    const row = [];
    for (;;) {
      ws(); let value = '';
      if (text[i] === "'") {
        i++; let closed = false;
        while (i < text.length) {
          const c = text[i++];
          if (c === '\\') {
            const next = text[i++];
            value += ({ n: '\n', r: '\r', t: '\t', '0': '\0', Z: '\x1a' })[next] ?? next;
          } else if (c === "'") {
            if (text[i] === "'") { value += "'"; i++; } else { closed = true; break; }
          } else value += c;
        }
        if (!closed) throw Error('Unterminated SQL string');
      } else {
        const start = i; while (i < text.length && ![',', ')'].includes(text[i])) i++;
        value = text.slice(start, i).trim();
        if (value === 'NULL') value = null;
        else if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw Error('Unsupported SQL value');
      }
      row.push(value); ws();
      if (text[i] === ')') { i++; break; }
      if (text[i++] !== ',') throw Error('Invalid SQL delimiter');
    }
    rows.push(row); ws();
    if (text[i] === ',') i++;
    else if (text[i] !== ';' && i < text.length) throw Error('Invalid SQL tuple delimiter');
  }
  return rows;
}

const names = ['users', 'usermeta', 'posts', 'postmeta', 'comments', 'commentmeta', 'woocommerce_order_items', 'woocommerce_order_itemmeta', 'options'];
const postKeys = new Set(['_sku', '_customer_user', '_order_total', '_order_currency', '_payment_method', '_transaction_id', '_order_shipping', '_order_tax', '_order_shipping_tax', '_cart_discount', '_date_paid', '_paid_date', '_billing_first_name', '_billing_last_name', '_billing_email', '_billing_phone', '_billing_address_1', '_billing_address_2', '_billing_city', '_billing_state', '_billing_country', '_billing_postcode', '_shipping_first_name', '_shipping_last_name', '_shipping_address_1', '_shipping_address_2', '_shipping_city', '_shipping_state', '_shipping_country', '_shipping_postcode']);
const itemKeys = new Set(['_product_id', '_variation_id', '_qty', '_line_subtotal', '_line_total', '_line_tax', '_line_subtotal_tax']);
export async function readSource(path, retainTables = names) {
  const tables = Object.fromEntries(names.map(n => [n, []]));
  const seen = new Set(); const hash = createHash('sha256');
  const stream = createReadStream(path); stream.on('data', data => hash.update(data));
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let table = null, columns = [], buffer = '';
  try {
    for await (const line of lines) {
      const header = line.match(/^INSERT INTO `wpgh_([^`]+)` \((.+)\) VALUES\s*(.*)$/);
      if (header) {
        if (table) throw Error('Incomplete SQL insert');
        if (names.includes(header[1])) seen.add(header[1]);
        table = retainTables.includes(header[1]) ? header[1] : null;
        if (table) { seen.add(table); columns = [...header[2].matchAll(/`([^`]+)`/g)].map(m => m[1]); buffer = header[3]; }
      } else if (table) buffer += line + '\n';
      if (buffer.length > 32 * 1024 * 1024) throw Error('SQL insert exceeds supported size');
      if (table && buffer.trimEnd().endsWith(';')) {
        if (buffer.length > 32 * 1024 * 1024) throw Error('SQL insert exceeds supported size');
        for (const values of parseValues(buffer)) {
          if (values.length !== columns.length) throw Error('SQL column count mismatch');
          const row = Object.fromEntries(columns.map((c, n) => [c, values[n]]));
          if (table === 'postmeta' && !postKeys.has(row.meta_key)) continue;
          if (table === 'woocommerce_order_itemmeta' && !itemKeys.has(row.meta_key)) continue;
          if (table === 'usermeta' && row.meta_key !== 'wpgh_capabilities' && !/^billing_|^shipping_/.test(row.meta_key)) continue;
          if (table === 'comments' && !['review', 'comment'].includes(row.comment_type)) continue;
          if (table === 'commentmeta' && !['rating', 'verified'].includes(row.meta_key)) continue;
          if (table === 'options' && row.option_name !== 'woocommerce_custom_orders_table_enabled') continue;
          if (table === 'posts' && !['shop_order', 'shop_order_refund', 'product', 'product_variation'].includes(row.post_type)) continue;
          if (table === 'users') { delete row.user_pass; delete row.user_activation_key; }
          tables[table].push(row);
        }
        table = null; buffer = '';
      }
    }
    if (table) throw Error('Incomplete SQL backup');
    if (!seen.has('posts') || !seen.has('users')) throw Error('Expected wpgh_ WooCommerce source tables were not found');
    if (tables.options.find(r => r.option_name === 'woocommerce_custom_orders_table_enabled')?.option_value !== 'no') throw Error('This importer requires an explicitly disabled HPOS source');
    return { tables, fingerprint: hash.digest('hex') };
  } finally { lines.close(); stream.destroy(); }
}
