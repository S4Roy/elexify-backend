import { generalHelper } from "../../helpers/index.js";
import SiteSetting from "../../models/SiteSetting.js";
import User from "../../models/User.js";

const DbSeedingController = {
  seed: async function (req, resp) {
    /**
     * =======================
     * IMPORTING SITE SETTINGS
     * =======================
     */
    const settings = [
      {
        slug: "site_title",
        value: "Elexify Online",
        label: "Site Title",
        type: "site_info",
      },
      {
        slug: "site_tagline",
        value: "Elexify Industries Admin Panel",
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
        value: "support@elexify.online",
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
        slug: "low_stock_threshold",
        value: "5",
        label: "Low Stock Threshold",
        type: "product_info",
      },
    ];
    console.log("setting", "setting");

    for (const setting of settings) {
      let doc = {
        slug: setting.slug,
        label: setting.label,
        type: setting.type,
      };

      try {
        const result = await SiteSetting.findOne({ slug: doc.slug }).exec();
        if (!result) {
          doc.value = setting.value;
        }
      } catch (err) {
        doc.value = setting.value;
        console.error("SiteSetting Finding Error: ", err);
      }
      console.log(setting, "setting");

      try {
        await SiteSetting.updateOne({ slug: setting.slug }, doc, {
          upsert: true,
        });
      } catch (err) {
        console.error("SiteSetting Seeding Error: ", err);
      }
    }

    /**
     * ==================================
     * INSERTING SUPERADMIN IF NOT EXISTS
     * ==================================
     */
    try {
      const adminCount = await User.countDocuments({
        role: "superadmin",
        deleted_at: null,
      }).exec();
      if (adminCount < 1) {
        const document = {
          role: "superadmin",
          name: "Elexify Admin",
          email: "superadmin@baseweb.in",
          password: await generalHelper.bcryptMake("Admin@1234"),
        };

        await User.create(document);
      }
    } catch (err) {
      console.error("User @superadmin Seeding Error: ", err);
    }

    return resp.send(`
        <h3 style="text-align: center; padding: 10% 0; text-transform: uppercase;">
            !! DB Seeding Completed !!
        </h3>`);
  },
};

export default DbSeedingController;
