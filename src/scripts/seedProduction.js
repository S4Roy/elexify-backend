/**
 * Seeds core site settings and (optionally) the first superadmin account.
 * Safe to re-run — settings are upserted, and the superadmin is only
 * created when no superadmin exists yet.
 *
 * Superadmin credentials are never hardcoded here — pass them as env vars
 * so nothing sensitive lands in the repo or shell history file:
 *
 *   SUPERADMIN_EMAIL="admin@elexify.online" SUPERADMIN_PASSWORD="<strong password>" \
 *     node src/scripts/seedProduction.js
 *
 * If a superadmin already exists, the env vars are ignored and only site
 * settings are seeded — omit them entirely for that case.
 */
import mongoose from "../config/mongoose.js";
import { generalHelper } from "../helpers/index.js";
import SiteSetting from "../models/SiteSetting.js";
import User from "../models/User.js";

const run = async () => {
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once("open", resolve);
      mongoose.connection.once("error", reject);
    });
  }

  const settings = [
    {
      slug: "site_title",
      value: "Elexify Industries",
      label: "Site Title",
      type: "site_info",
    },
    {
      slug: "site_tagline",
      value: "Your Trusted Source for Electronic Components",
      label: "Site Tagline",
      type: "site_info",
    },
    {
      slug: "contact_mobile",
      value: "9064401121",
      label: "Contact Mobile",
      type: "contact_info",
    },
    {
      slug: "contact_mobile_2",
      value: "8906787168",
      label: "Contact Mobile 2",
      type: "contact_info",
    },
    {
      slug: "contact_email",
      value: "support@baseweb.in",
      label: "Contact Email",
      type: "contact_info",
    },
    {
      slug: "contact_address",
      value: "Saltlake, Kolkata - 700091",
      label: "Contact Address",
      type: "contact_info",
    },
    {
      slug: "whatsapp_number",
      value: "919064401121",
      label: "WhatsApp Number (digits only, with country code)",
      type: "contact_info",
    },
    {
      slug: "social_instagram_url",
      value: "",
      label: "Instagram URL",
      type: "social_links",
    },
    {
      slug: "social_facebook_url",
      value: "",
      label: "Facebook URL",
      type: "social_links",
    },
    {
      slug: "social_youtube_url",
      value: "",
      label: "YouTube URL",
      type: "social_links",
    },
    {
      slug: "low_stock_threshold",
      value: "5",
      label: "Low Stock Threshold",
      type: "product_info",
    },
    {
      slug: "homepage_video_url",
      value: "",
      label: "Homepage Video URL",
      type: "homepage",
    },
    {
      slug: "homepage_video_poster_url",
      value: "",
      label: "Homepage Video Poster Image",
      type: "homepage",
    },
  ];

  for (const setting of settings) {
    await SiteSetting.updateOne(
      { slug: setting.slug },
      {
        slug: setting.slug,
        label: setting.label,
        type: setting.type,
        value: setting.value,
      },
      { upsert: true }
    );
  }
  console.log(`Seeded ${settings.length} site settings.`);

  const adminCount = await User.countDocuments({
    role: "superadmin",
    deleted_at: null,
  });

  if (adminCount < 1) {
    const email = process.env.SUPERADMIN_EMAIL;
    const password = process.env.SUPERADMIN_PASSWORD;

    if (!email || !password) {
      console.error(
        "No superadmin exists yet, but SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD " +
          "were not provided. Re-run with both set to create one, e.g.\n" +
          '  SUPERADMIN_EMAIL="admin@elexify.online" SUPERADMIN_PASSWORD="<strong password>" ' +
          "node src/scripts/seedProduction.js"
      );
      process.exit(1);
    }

    await User.create({
      role: "superadmin",
      name: "Super Admin",
      email,
      password: await generalHelper.bcryptMake(password),
    });
    console.log(`Created superadmin account: ${email}`);
  } else {
    console.log("A superadmin already exists — skipping superadmin creation.");
  }

  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
