import NotificationJob from "../../../models/NotificationJob.js";
import NotificationLog from "../../../models/NotificationLog.js";
import { StatusError } from "../../../config/index.js";
import { auditService } from "../../../services/index.js";

/**
 * Manual retry of a dead-lettered job — resets it back into the queue
 * (RETRYING, due immediately, attempts reset to 0 so it gets the full
 * max_attempts budget again) for the next processNotificationQueue() tick
 * to pick up. Does NOT allow editing the payload — same event/channel/data
 * as originally enqueued, only the schedule/attempt-count changes.
 */
export const retry = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const admin_id = req.auth?.user_id;

    const job = await NotificationJob.findOneAndUpdate(
      { _id: jobId, status: "DEAD_LETTER" },
      {
        $set: {
          status: "RETRYING",
          attempts: 0,
          next_attempt_at: new Date(),
          error_class: null,
          last_error_safe: null,
          updated_at: new Date(),
        },
      },
      { new: true }
    );

    if (!job) throw StatusError.notFound(req.__("Dead-letter notification job not found"));

    if (job.notification_log_id) {
      await NotificationLog.updateOne(
        { _id: job.notification_log_id },
        { $set: { status: "RETRYING" } }
      );
    }

    await auditService.recordAudit({
      userId: job.user_id,
      event: "NOTIFICATION_MANUAL_RETRY",
      req,
      actorId: admin_id,
      metadata: { job_id: job._id, event_name: job.event, channel: job.channel },
    });

    res.status(200).json({
      status: "success",
      message: req.__("Notification queued for retry"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
