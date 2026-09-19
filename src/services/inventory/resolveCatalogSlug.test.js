import { describe, expect, it, vi } from 'vitest';
import { resolveCatalogSlug, LEGACY_PRODUCT_SLUGS } from './resolveCatalogSlug.js';

const model = (exact, matches = []) => ({
  findOne: vi.fn(() => ({ select: () => ({ lean: async () => exact }) })),
  find: vi.fn(() => ({ select: () => ({ limit: () => ({ lean: async () => matches }) }) })),
});

describe('catalog legacy URLs', () => {
  it('treats object prototype names as ordinary slugs', async () => {
    const Model = model(null);
    expect(await resolveCatalogSlug(Model, 'constructor')).toBeNull();
    expect(Model.find.mock.calls[0][0].$or[0].slug.$in).toEqual(['constructor']);
  });
  it('keeps canonical records ahead of historical aliases', async () => {
    const current = { _id: '1', slug: 'current' };
    const Model = model(current);
    expect(await resolveCatalogSlug(Model, 'current')).toBe(current);
    expect(Model.find).not.toHaveBeenCalled();
  });
  it('resolves underscore category URLs only against existing active records', async () => {
    const Model = model(null, [{ _id: '1', slug: 'lithium-battery' }]);
    expect((await resolveCatalogSlug(Model, 'lithium_battery')).slug).toBe('lithium-battery');
    expect(Model.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', deleted_at: null,
      $or: [{ slug: { $in: ['lithium_battery', 'lithium-battery'] } }, { legacy_slugs: { $in: ['lithium_battery', 'lithium-battery'] } }],
    }));
  });
  it('uses the verified transformer mapping', async () => {
    const slug = 'transformer-24-0-24-10-amp-12-0-12-1-amp';
    const Model = model(null, [{ _id: '1', slug: LEGACY_PRODUCT_SLUGS[slug] }]);
    expect((await resolveCatalogSlug(Model, slug, LEGACY_PRODUCT_SLUGS)).slug).toBe(LEGACY_PRODUCT_SLUGS[slug]);
    expect(Model.find.mock.calls[0][0].$or[0].slug.$in).toContain(LEGACY_PRODUCT_SLUGS[slug]);
  });
  it('resolves old names directly to the current record', async () => {
    expect(await resolveCatalogSlug(model(null, [{ _id: '1', slug: 'third-name' }]), 'first-name'))
      .toEqual({ _id: '1', slug: 'third-name' });
  });
  it.each([[], [{ _id: '1' }, { _id: '2' }]])('does not guess missing or ambiguous targets', async matches => {
    expect(await resolveCatalogSlug(model(null, matches), 'unknown')).toBeNull();
  });
  it.each(['', null, 'a'.repeat(501)])('rejects invalid slug input', async slug => {
    const Model = model(null);
    expect(await resolveCatalogSlug(Model, slug)).toBeNull();
    expect(Model.findOne).not.toHaveBeenCalled();
  });
});
