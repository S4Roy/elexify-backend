import ShippingSettings from "../../../../models/ShippingSettings.js";
import { auditService } from "../../../../services/index.js";

export const edit = async (req, res, next) => {
  try {
    const {
      processing_days_min,
      processing_days_max,
      exclude_weekends,
      weekend_days,
      holidays,
      order_cutoff_time,
      default_shipping_zone,
      cod_enabled,
      cod_min_order,
      cod_max_order,
      cod_charge_enabled,
      cod_charge,
      cod_allowed_pincodes,
      cod_disallowed_pincodes,
      cod_disallowed_categories,
      cod_disallowed_brands,
      cod_disallowed_shipping_classes,
      cod_disallowed_zones,
      cod_allowed_customer_types,
      customer_cancellation_enabled,
      customer_cancellation_statuses,
      customer_cancel_packed_before_dispatch,
      admin_cancellation_enabled,
      admin_cancellation_statuses,
      returns_enabled,
      return_window_days,
      return_auto_approve,
      return_require_images,
      return_reasons,
    } = req.body;

    const settings = await ShippingSettings.getSingleton();

    Object.assign(settings, {
      ...(processing_days_min !== undefined && { processing_days_min }),
      ...(processing_days_max !== undefined && { processing_days_max }),
      ...(exclude_weekends !== undefined && { exclude_weekends }),
      ...(weekend_days !== undefined && { weekend_days }),
      ...(holidays !== undefined && { holidays }),
      ...(order_cutoff_time !== undefined && { order_cutoff_time }),
      ...(default_shipping_zone !== undefined && {
        default_shipping_zone: default_shipping_zone || null,
      }),
      ...(cod_enabled !== undefined && { cod_enabled }),
      ...(cod_min_order !== undefined && { cod_min_order }),
      ...(cod_max_order !== undefined && { cod_max_order: cod_max_order || null }),
      ...(cod_charge_enabled !== undefined && { cod_charge_enabled }),
      ...(cod_charge !== undefined && { cod_charge }),
      ...(cod_allowed_pincodes !== undefined && { cod_allowed_pincodes }),
      ...(cod_disallowed_pincodes !== undefined && { cod_disallowed_pincodes }),
      ...(cod_disallowed_categories !== undefined && { cod_disallowed_categories }),
      ...(cod_disallowed_brands !== undefined && { cod_disallowed_brands }),
      ...(cod_disallowed_shipping_classes !== undefined && { cod_disallowed_shipping_classes }),
      ...(cod_disallowed_zones !== undefined && { cod_disallowed_zones }),
      ...(cod_allowed_customer_types !== undefined && { cod_allowed_customer_types }),
      ...(customer_cancellation_enabled !== undefined && { customer_cancellation_enabled }),
      ...(customer_cancellation_statuses !== undefined && { customer_cancellation_statuses }),
      ...(customer_cancel_packed_before_dispatch !== undefined && { customer_cancel_packed_before_dispatch }),
      ...(admin_cancellation_enabled !== undefined && { admin_cancellation_enabled }),
      ...(admin_cancellation_statuses !== undefined && { admin_cancellation_statuses }),
      ...(returns_enabled !== undefined && { returns_enabled }),
      ...(return_window_days !== undefined && { return_window_days }),
      ...(return_auto_approve !== undefined && { return_auto_approve }),
      ...(return_require_images !== undefined && { return_require_images }),
      ...(return_reasons !== undefined && { return_reasons }),
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    });

    await settings.save();

    await auditService.recordAudit({
      userId: req.auth.user_id,
      actorId: req.auth.user_id,
      req,
      event: "FULFILLMENT_POLICY_UPDATED",
      metadata: {
        customer_cancellation_enabled: settings.customer_cancellation_enabled,
        admin_cancellation_enabled: settings.admin_cancellation_enabled,
        returns_enabled: settings.returns_enabled,
        return_window_days: settings.return_window_days,
      },
    });

    res.status(200).json({
      status: "success",
      message: req.__("Shipping Settings updated successfully"),
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};
