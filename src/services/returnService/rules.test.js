import { validReturnWebhookToken } from "./webhookAuth.js";
import { describe, expect, it } from 'vitest';
import { quantityAmount, requestAmount, eligibleQuantity, returnEligibility, mapReverseStatus, canAdvancePickup } from './rules.js';
describe('return rules', () => {
  it('rejects missing and public webhook tokens', () => {
    expect(validReturnWebhookToken(undefined, 'private')).toBe(false);
    expect(validReturnWebhookToken('public', 'private')).toBe(false);
    expect(validReturnWebhookToken('private', 'private')).toBe(true);
  });
  it('does not reuse rounding cents when an earlier request is rejected', () => {
    expect(requestAmount(100, 3, 1, 1, 67)).toBe(33);
    expect(requestAmount(100, 3, 1, 1, 66)).toBe(34);
  });
  it('allocates rounding residuals exactly across partial quantities', () => {
    expect([0,1,2].map((offset) => quantityAmount(100,3,offset,1))).toEqual([33,33,34]);
  });
  it('counts both refund and replacement requests against purchased quantity', () => {
    expect(eligibleQuantity({ _id: 'i', quantity: 3 }, [{ status: 'completed', items: [{ order_item_id: 'i', quantity: 1 }] }])).toBe(2);
  });
  it('does not count rejected or cancelled requests', () => {
    expect(eligibleQuantity({ _id: 'i', quantity: 1 }, [{ status: 'rejected', items: [{ order_item_id: 'i', quantity: 1 }] }])).toBe(1);
  });
  it('requires actual delivery and enabled policy', () => {
    expect(returnEligibility({ order_status: 'delivered' }, { returns_enabled: true, return_window_days: 7 }, [], []).allowed).toBe(false);
  });
  it('maps exact provider statuses and rejects unrelated strings', () => {
    expect(mapReverseStatus('RETURN PICKED UP')).toBe('picked_up');
    expect(mapReverseStatus('not delivered')).toBeNull();
  });
  it('rejects regressions after receipt and permits retry before pickup', () => {
    expect(canAdvancePickup('delivered','in_transit')).toBe(false);
    expect(canAdvancePickup('picked_up','failed')).toBe(false);
    expect(canAdvancePickup('failed','scheduled')).toBe(true);
  });
});
