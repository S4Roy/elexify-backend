import NavigationMenu from "../../../../models/NavigationMenu.js";
import NavigationMenuItem from "../../../../models/NavigationMenuItem.js";
import { runSeedFooterPolicies, FOOTER_POLICY_ITEMS } from "../../../seedFooterPolicies.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  if (context.dryRun) {
    const menu = await NavigationMenu.findOne({ slug: "footer-menu", deleted_at: null }).lean();
    const existing = menu
      ? await NavigationMenuItem.find({ menu_id: menu._id, deleted_at: null }).select("label custom_url").lean()
      : [];
    const existingUrls = new Set(existing.map((i) => i.custom_url));
    const desiredUrls = new Set(FOOTER_POLICY_ITEMS.map((i) => i.custom_url));
    const wouldInsert = FOOTER_POLICY_ITEMS.filter((i) => !existingUrls.has(i.custom_url)).length;
    const wouldRemove = existing.filter((i) => !desiredUrls.has(i.custom_url)).length;
    context.logger.info(
      `Dry run: footer-menu would gain ${wouldInsert} item(s) and lose ${wouldRemove} item(s) not in the policy list.`,
    );
    return { wouldInsert, wouldUpdate: 0, wouldSkip: FOOTER_POLICY_ITEMS.length - wouldInsert, wouldDelete: wouldRemove };
  }

  const { result } = await runSeedFooterPolicies({ logger: context.logger });
  return result;
};

const healthCheck = async () => {
  const menu = await NavigationMenu.findOne({ slug: "footer-menu", deleted_at: null }).lean();
  if (!menu) return { status: "DEGRADED", expected: FOOTER_POLICY_ITEMS.length, actual: 0, detail: "footer-menu does not exist." };

  const items = await NavigationMenuItem.find({ menu_id: menu._id, deleted_at: null }).select("custom_url").lean();
  const urls = new Set(items.map((i) => i.custom_url));
  const actual = FOOTER_POLICY_ITEMS.filter((i) => urls.has(i.custom_url)).length;
  return {
    status: actual === FOOTER_POLICY_ITEMS.length ? "HEALTHY" : "DEGRADED",
    expected: FOOTER_POLICY_ITEMS.length,
    actual,
    detail: `${actual}/${FOOTER_POLICY_ITEMS.length} required footer policy link(s) present.`,
  };
};

export default {
  key: "footer-policies",
  name: "Seed Footer Policy Links",
  description:
    "Reconciles the storefront footer's 'Our Policies' section to exactly: Privacy Policy, Refund & Cancellations, Terms & Conditions, About Us — removing any other footer-menu items.",
  type: "SEEDER",
  category: "content",
  version: 1,
  required: false,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: ["cms-pages"],
  estimatedImpact:
    "Creates/updates up to 4 NavigationMenuItem document(s) on the footer-menu and soft-deletes any others; invalidates the navigation cache.",
  supportsDryRun: true,
  requiresConfirmation: false,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
  healthCheck,
};
