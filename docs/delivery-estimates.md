# Delivery estimates

Configure **Settings → Shipping Settings → Estimated Delivery** in the admin panel.

1. Enable Shiprocket and save its API credentials in Integration Credentials.
2. Select Shiprocket live estimates and enter the pincode of the pickup location used to book shipments.
3. Choose recommended, conservative (slowest available), or fastest courier estimates. Recommended falls back to conservative when the recommended courier has no usable ETA. Match this policy to actual courier booking practices; it does not assign a courier.
4. Set processing days, the order cutoff in Asia/Kolkata, nonworking days, holidays, and a buffer. The buffer adds calendar days to the latest date only.
5. Choose whether to use manually configured shipping-zone transit days during provider outages. Disable fallback to hide unavailable dates. An explicitly empty eligible courier list never receives a fallback date.

The product page, cart/Buy Now checkout, and order placement use the same calculation. Checkout refreshes on payment-method changes so COD quotes filter out prepaid-only couriers. Order placement stores the calculated display window in the existing `etd` field; shipment tracking continues to update courier ETDs after dispatch.

Shiprocket transit comes from `data.available_courier_companies[].estimated_delivery_days`. Processing follows the warehouse calendar; live transit uses calendar days. Manual zone transit continues to follow business days. Cutoff and holidays are recomputed for every request. Transit responses are cached for five minutes per route, weight, COD flag and selection policy; failures are cached for 30 seconds. The cache is bounded and requests are coalesced within each server process.

Reference: [Shiprocket serviceability API](https://www.postman.com/shiprocketdev/shiprocket-dev-s-public-workspace/request/430dqxn/check-courier-serviceability).

Shipping prices remain configured under Shipping Rates. Domestic live quotes use product/cart weights in kg (0.5 kg if missing); final packed dimensions, multi-warehouse routing and courier assignment may change actual delivery. International routes use manual fallback or no date. Customer labels explicitly describe estimates rather than guaranteed arrival dates.

Without a pickup pincode, existing stores use zone fallback until configured. No credentials or live database settings are changed by this code change.

Verification uses mocked provider responses and deterministic dates; verify a known serviceable destination with the connected account after configuring the pickup pincode. No real shipment needs to be created.
