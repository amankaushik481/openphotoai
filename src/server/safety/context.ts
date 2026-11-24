/** Who/what a safety decision is about (stored on moderation_events). */
export interface SafetyContext {
  userId: string;
  jobId?: string;
  modelId?: string;
}
