import PDFDocument from "pdfkit";

const PAGE_MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4 pt
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - PAGE_MARGIN - 60; // leave room for footer/page number

// PDFKit's built-in Helvetica (a base-14 PDF font, no embedded Unicode
// glyphs) cannot render "₹" — it prints as a garbled/missing-glyph box, and
// this codebase has no Unicode TTF asset available to embed instead. "Rs."
// avoids that failure mode entirely while still using correct Indian
// digit grouping (1,25,000.00), which is what actually matters for
// readability/correctness here.
const inr = (amount, currency = "INR") => {
  const grouped = new Intl.NumberFormat("en-IN", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
  return currency === "INR" ? `Rs. ${grouped}` : `${currency} ${grouped}`;
};

const fmtDate = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

const addressLines = (address) => {
  if (!address) return ["Address unavailable"];
  const locality = [address.address_line_1, address.address_line_2, address.land_mark].filter(Boolean);
  const region = [address.city, address.state, address.postcode].filter(Boolean).join(", ");
  return [
    address.full_name,
    ...locality,
    region,
    address.country,
    address.phone ? `Phone: ${address.phone_code ? "+" + address.phone_code + " " : ""}${address.phone}` : null,
  ].filter(Boolean);
};

const paymentMethodLabel = (method) => {
  if (method === "cod") return "Cash on Delivery";
  if (method === "razorpay") return "Online Payment (Razorpay)";
  if (method === "paypal") return "Online Payment (PayPal)";
  return method || "-";
};

// COD is never shown as "Paid" before the payment is actually collected —
// its payment_status stays "pending" on the order/invoice snapshot itself,
// this only controls the display label.
const paymentStatusLabel = (invoice) => {
  if (invoice.payment_method === "cod") return "Cash on Delivery";
  if (invoice.payment_status === "paid") return "Paid";
  if (invoice.payment_status === "refunded") return "Refunded";
  return invoice.payment_status || "-";
};

const ITEM_COLS_BASE = [
  { key: "idx", label: "#", width: 20 },
  { key: "product", label: "Product", width: 175 },
  { key: "qty", label: "Qty", width: 30, align: "right" },
  { key: "rate", label: "Rate", width: 55, align: "right" },
  { key: "discount", label: "Discount", width: 55, align: "right" },
];
const ITEM_COLS_GST = [
  { key: "tax", label: "Tax", width: 70, align: "right" },
];
const ITEM_COLS_TOTAL = [{ key: "amount", label: "Amount", width: 0, align: "right" }]; // width filled dynamically

// Builds the full column layout (with x offsets) for the given GST mode.
const buildColumns = (isGstApplicable) => {
  const cols = [...ITEM_COLS_BASE, ...(isGstApplicable ? ITEM_COLS_GST : []), ...ITEM_COLS_TOTAL];
  const fixedWidth = cols.reduce((sum, c) => sum + (c.width || 0), 0);
  const remaining = CONTENT_WIDTH - fixedWidth;
  cols[cols.length - 1].width = Math.max(remaining, 60);
  let x = PAGE_MARGIN;
  return cols.map((c) => {
    const withX = { ...c, x };
    x += c.width;
    return withX;
  });
};

// Renders a PDF Tax Invoice from a frozen Invoice document (see
// src/models/Invoice.js). Pure function of its input — the same Invoice
// document always renders the same PDF, which is why the PDF itself is
// never stored: it is cheap and deterministic to regenerate on every
// download from the frozen snapshot.
export const renderInvoicePdf = (invoice) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const currency = invoice.currency || "INR";
    const columns = buildColumns(invoice.is_gst_applicable);

    const drawHeader = () => {
      const top = PAGE_MARGIN;
      doc.font("Helvetica-Bold").fontSize(16).text("TAX INVOICE", PAGE_MARGIN, top, {
        width: CONTENT_WIDTH,
        align: "center",
      });

      const infoTop = top + 30;
      const company = invoice.company || {};
      doc.font("Helvetica-Bold").fontSize(11).text(company.name || "Elexify Online", PAGE_MARGIN, infoTop);
      doc.font("Helvetica").fontSize(9);
      let y = infoTop + 16;
      if (company.address) {
        doc.text(company.address, PAGE_MARGIN, y, { width: 260 });
        y += doc.heightOfString(company.address, { width: 260 }) + 2;
      }
      if (company.gstin) {
        doc.text(`GSTIN: ${company.gstin}`, PAGE_MARGIN, y);
        y += 12;
      }
      if (company.email) {
        doc.text(`Email: ${company.email}`, PAGE_MARGIN, y);
        y += 12;
      }
      if (company.phone) {
        doc.text(`Phone: ${company.phone}`, PAGE_MARGIN, y);
        y += 12;
      }

      const metaX = PAGE_MARGIN + 320;
      const metaRows = [
        ["Invoice No", invoice.invoice_number],
        ["Invoice Date", fmtDate(invoice.invoice_date)],
        ["Order No", invoice.order_number],
        ["Order Date", fmtDate(invoice.order_date)],
        ["Payment Method", paymentMethodLabel(invoice.payment_method)],
        ["Payment Status", paymentStatusLabel(invoice)],
      ];
      let metaY = infoTop;
      metaRows.forEach(([label, value]) => {
        doc.font("Helvetica-Bold").fontSize(9).text(`${label}:`, metaX, metaY, { continued: true, width: 235 });
        doc.font("Helvetica").text(` ${value ?? "-"}`);
        metaY += 14;
      });

      const addrTop = Math.max(y, metaY) + 10;
      doc.moveTo(PAGE_MARGIN, addrTop).lineTo(PAGE_WIDTH - PAGE_MARGIN, addrTop).strokeColor("#cccccc").stroke();

      const colWidth = CONTENT_WIDTH / 2 - 10;
      const billTop = addrTop + 12;
      doc.font("Helvetica-Bold").fontSize(10).text("BILLED TO", PAGE_MARGIN, billTop);
      doc.font("Helvetica").fontSize(9).text(addressLines(invoice.billing_address).join("\n"), PAGE_MARGIN, billTop + 14, {
        width: colWidth,
      });

      const shipX = PAGE_MARGIN + colWidth + 20;
      doc.font("Helvetica-Bold").fontSize(10).text("SHIPPED TO", shipX, billTop, {
        width: colWidth,
      });
      doc.font("Helvetica").fontSize(9).text(addressLines(invoice.shipping_address).join("\n"), shipX, billTop + 14, {
        width: colWidth,
      });

      const billingHeight = doc.heightOfString(addressLines(invoice.billing_address).join("\n"), { width: colWidth });
      const shippingHeight = doc.heightOfString(addressLines(invoice.shipping_address).join("\n"), { width: colWidth });
      const afterAddr = billTop + 14 + Math.max(billingHeight, shippingHeight) + 12;
      doc.moveTo(PAGE_MARGIN, afterAddr).lineTo(PAGE_WIDTH - PAGE_MARGIN, afterAddr).strokeColor("#cccccc").stroke();

      return afterAddr + 10;
    };

    const drawTableHeader = (y) => {
      doc.font("Helvetica-Bold").fontSize(8);
      columns.forEach((col) => {
        doc.text(col.label, col.x, y, { width: col.width, align: col.align || "left" });
      });
      const lineY = y + 14;
      doc.moveTo(PAGE_MARGIN, lineY).lineTo(PAGE_WIDTH - PAGE_MARGIN, lineY).strokeColor("#999999").stroke();
      return lineY + 6;
    };

    let cursorY = drawHeader();
    doc.font("Helvetica-Bold").fontSize(10).text("ITEM DETAILS", PAGE_MARGIN, cursorY);
    cursorY += 16;
    cursorY = drawTableHeader(cursorY);

    (invoice.items || []).forEach((item, idx) => {
      const productLabel = [item.product_name, item.variation_name].filter(Boolean).join("\n");
      const skuLabel = item.sku ? `SKU: ${item.sku}` : "";
      const fullProductText = [productLabel, skuLabel].filter(Boolean).join("\n");
      const rowHeight = Math.max(
        doc.heightOfString(fullProductText, { width: columns[1].width }),
        14
      );

      if (cursorY + rowHeight > CONTENT_BOTTOM) {
        doc.addPage();
        cursorY = PAGE_MARGIN;
        cursorY = drawTableHeader(cursorY);
      }

      doc.font("Helvetica").fontSize(8);
      doc.text(String(idx + 1), columns[0].x, cursorY, { width: columns[0].width });
      doc.text(fullProductText, columns[1].x, cursorY, { width: columns[1].width });
      doc.text(String(item.quantity), columns[2].x, cursorY, { width: columns[2].width, align: "right" });
      doc.text(inr(item.unit_price, currency), columns[3].x, cursorY, { width: columns[3].width, align: "right" });
      doc.text(item.discount ? inr(item.discount, currency) : "-", columns[4].x, cursorY, {
        width: columns[4].width,
        align: "right",
      });

      let colIdx = 5;
      if (invoice.is_gst_applicable) {
        doc.text(item.tax_amount ? inr(item.tax_amount, currency) : "-", columns[colIdx].x, cursorY, {
          width: columns[colIdx].width,
          align: "right",
        });
        colIdx += 1;
      }
      doc.text(inr(item.total, currency), columns[colIdx].x, cursorY, {
        width: columns[colIdx].width,
        align: "right",
      });

      cursorY += rowHeight + 8;
    });

    cursorY += 4;
    doc.moveTo(PAGE_MARGIN, cursorY).lineTo(PAGE_WIDTH - PAGE_MARGIN, cursorY).strokeColor("#999999").stroke();
    cursorY += 10;

    // ── Totals block ──────────────────────────────────────────────────────
    const totals = invoice.totals || {};
    const totalsRows = [
      ["Subtotal", totals.subtotal],
      totals.product_discount ? ["Product Discount", -totals.product_discount] : null,
      totals.coupon_discount ? ["Coupon Discount", -totals.coupon_discount] : null,
      ["Shipping", totals.shipping],
      totals.cod_fee ? ["COD Fee", totals.cod_fee] : null,
      invoice.is_gst_applicable ? ["Tax/GST", totals.tax_total] : null,
    ].filter(Boolean);

    if (cursorY + (totalsRows.length + 4) * 14 > CONTENT_BOTTOM) {
      doc.addPage();
      cursorY = PAGE_MARGIN;
    }

    const totalsLabelX = PAGE_WIDTH - PAGE_MARGIN - 220;
    const totalsValueX = PAGE_WIDTH - PAGE_MARGIN - 100;
    doc.font("Helvetica").fontSize(9);
    totalsRows.forEach(([label, value]) => {
      doc.text(label, totalsLabelX, cursorY, { width: 110 });
      doc.text(inr(value, currency), totalsValueX, cursorY, { width: 100, align: "right" });
      cursorY += 14;
    });
    doc.moveTo(totalsLabelX, cursorY).lineTo(PAGE_WIDTH - PAGE_MARGIN, cursorY).strokeColor("#999999").stroke();
    cursorY += 6;
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("Grand Total", totalsLabelX, cursorY, { width: 110 });
    doc.text(inr(totals.grand_total, currency), totalsValueX, cursorY, { width: 100, align: "right" });
    cursorY += 24;

    if (cursorY + 60 > CONTENT_BOTTOM) {
      doc.addPage();
      cursorY = PAGE_MARGIN;
    }

    doc.font("Helvetica-Bold").fontSize(9).text("Amount in Words:", PAGE_MARGIN, cursorY);
    cursorY += 12;
    doc.font("Helvetica").fontSize(9).text(totals.amount_in_words || "-", PAGE_MARGIN, cursorY, { width: CONTENT_WIDTH });
    cursorY += doc.heightOfString(totals.amount_in_words || "-", { width: CONTENT_WIDTH }) + 16;

    if (cursorY + 70 > CONTENT_BOTTOM) {
      doc.addPage();
      cursorY = PAGE_MARGIN;
    }

    doc.font("Helvetica").fontSize(8).fillColor("#555555");
    doc.text(
      "Terms / Notes: Goods once sold are subject to the store's return/cancellation policy. This is a computer-generated invoice.",
      PAGE_MARGIN,
      cursorY,
      { width: CONTENT_WIDTH }
    );
    doc.fillColor("black");
    cursorY += doc.heightOfString(
      "Terms / Notes: Goods once sold are subject to the store's return/cancellation policy. This is a computer-generated invoice.",
      { width: CONTENT_WIDTH }
    );
    cursorY += 10;
    doc.font("Helvetica").fontSize(9).text("Thank you for shopping with us.", PAGE_MARGIN, cursorY);

    doc.font("Helvetica").fontSize(9).text("Authorized Signatory", PAGE_WIDTH - PAGE_MARGIN - 150, cursorY, {
      width: 150,
      align: "center",
    });

    // ── Page numbers, stamped in a final pass over every buffered page ────
    // The y position must stay inside PDFKit's own auto-pagination boundary
    // (pageHeight - bottom margin) — placing it below that (as a naive
    // "PAGE_HEIGHT - PAGE_MARGIN + 10" would) makes PDFKit think the text
    // doesn't fit and silently insert a genuine blank page per stamp call,
    // one for every page in the document.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#888888")
        .text(`Page ${i - range.start + 1} of ${range.count}`, PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN - 10, {
          width: CONTENT_WIDTH,
          align: "right",
          lineBreak: false,
        });
      doc.fillColor("black");
    }

    doc.end();
  });
