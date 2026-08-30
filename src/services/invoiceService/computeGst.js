// No per-product HSN/tax capture exists anywhere in the order pipeline
// today, so a single configurable flat rate is applied against the order's
// already-finalized grand_total (treated as tax-inclusive, standard for
// Indian D2C pricing) rather than hardcoding a percentage. If no GSTIN or
// a zero rate is configured, GST is simply not applicable — the invoice
// renderer omits the columns entirely rather than showing zeros.
export const computeGst = ({ grandTotal, shippingState, company }) => {
  const { gstin, gstRate, state: companyState } = company;

  if (!gstin || !gstRate || gstRate <= 0) {
    return {
      isGstApplicable: false,
      taxableAmount: grandTotal,
      taxAmount: 0,
      taxRate: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    };
  }

  const taxableAmount = Number((grandTotal / (1 + gstRate / 100)).toFixed(2));
  const taxAmount = Number((grandTotal - taxableAmount).toFixed(2));

  const normalizedCompanyState = String(companyState || "").trim().toLowerCase();
  const normalizedShippingState = String(shippingState || "").trim().toLowerCase();
  const isIntraState = Boolean(
    normalizedCompanyState &&
    normalizedShippingState &&
    normalizedCompanyState === normalizedShippingState,
  );

  return {
    isGstApplicable: true,
    taxableAmount,
    taxAmount,
    taxRate: gstRate,
    cgst: isIntraState ? Number((taxAmount / 2).toFixed(2)) : 0,
    sgst: isIntraState ? Number((taxAmount / 2).toFixed(2)) : 0,
    igst: isIntraState ? 0 : taxAmount,
  };
};
