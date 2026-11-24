/**
 * Admin back office (server only). Every function here is for admins: callers must have checked
 * the role (`route({ auth: "admin" })` or `requireAdminPage()`).
 */
import "server-only";

export {
  getStats,
  creditFlows,
  monthlyPriceCents,
  mrrByPlan,
  revenueFromPayments,
  type AdminStats,
  type DailyJobs,
  type DailyRevenue,
  type JobTypeStats,
  type PlanSubscriptionStats,
} from "./stats";
export {
  getUserDetail,
  searchUsers,
  suspendUser,
  unsuspendUser,
  type AdminModelItem,
  type AdminUserDetail,
  type AdminUserItem,
  type SuspendResult,
} from "./users";
export { listJobs, refundJobAdmin, type AdminJobItem, type ListJobsFilter } from "./jobs";
export {
  listModerationQueue,
  markEventReviewed,
  resolveReport,
  REPORT_REASON_LABELS,
  type QueueEvent,
  type QueueReport,
  type ResolveReportResult,
} from "./moderation";
export { listPayments, type AdminPaymentItem } from "./revenue";
export { REPORT_ACTIONS, type ReportAction } from "./schemas";
