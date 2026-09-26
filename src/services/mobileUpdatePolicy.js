// Environment-controlled release gate. Invalid configuration never locks users out.
export function mobileUpdatePolicy(platform, env = process.env) {
  if (!['android', 'ios'].includes(platform)) return null;
  const prefix = `MOBILE_${platform.toUpperCase()}`;
  const minimumVersion = env[`${prefix}_MIN_VERSION`] || '0.0.0';
  const storeUrl = platform === 'android'
    ? 'https://play.google.com/store/apps/details?id=com.elexify'
    : env.MOBILE_IOS_STORE_URL;
  const validVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(minimumVersion);
  const validStore = platform === 'android' || /^https:\/\/apps\.apple\.com\/(?:[a-z]{2}\/)?app\/(?:[^/?#]+\/)?id\d+$/.test(storeUrl || '');
  const enabled = env[`${prefix}_UPDATE_ENABLED`] === 'true';
  if (enabled && (!validVersion || !validStore)) throw new Error('Invalid mobile update policy');
  return { schemaVersion: 1, platform, enabled, minimumVersion: validVersion ? minimumVersion : '0.0.0', storeUrl: validStore ? storeUrl : null };
}

export function getMobileUpdatePolicy(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    const policy = mobileUpdatePolicy(req.query.platform);
    if (!policy) return res.status(400).json({ message: 'Invalid platform' });
    return res.json(policy);
  } catch {
    return res.status(503).json({ message: 'Update policy temporarily unavailable' });
  }
}
