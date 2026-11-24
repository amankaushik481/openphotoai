CREATE INDEX "batches_model_idx" ON "batches" USING btree ("model_id") WHERE "batches"."model_id" is not null;--> statement-breakpoint
CREATE INDEX "batches_running_idx" ON "batches" USING btree ("updated_at") WHERE "batches"."status" = 'running';--> statement-breakpoint
CREATE INDEX "consent_records_model_idx" ON "consent_records" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_created_idx" ON "credit_ledger" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_created_idx" ON "email_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "jobs_model_idx" ON "jobs" USING btree ("model_id") WHERE "jobs"."model_id" is not null;--> statement-breakpoint
CREATE INDEX "jobs_active_user_idx" ON "jobs" USING btree ("user_id") WHERE "jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "jobs_created_idx" ON "jobs" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "jobs_user_created_ms_idx" ON "jobs" USING btree ("user_id",date_trunc('milliseconds', "created_at", 'UTC'),"id");--> statement-breakpoint
CREATE INDEX "media_model_idx" ON "media" USING btree ("model_id") WHERE "media"."model_id" is not null;--> statement-breakpoint
CREATE INDEX "media_parent_idx" ON "media" USING btree ("parent_media_id") WHERE "media"."parent_media_id" is not null;--> statement-breakpoint
CREATE INDEX "media_user_created_ms_idx" ON "media" USING btree ("user_id",date_trunc('milliseconds', "created_at", 'UTC'),"id");--> statement-breakpoint
CREATE INDEX "model_shares_model_idx" ON "model_shares" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "moderation_events_unreviewed_idx" ON "moderation_events" USING btree ("created_at","id") WHERE "moderation_events"."reviewed" = false;--> statement-breakpoint
CREATE INDEX "payments_created_idx" ON "payments" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "reports_media_idx" ON "reports" USING btree ("media_id") WHERE "reports"."media_id" is not null;--> statement-breakpoint
CREATE INDEX "reports_share_link_idx" ON "reports" USING btree ("share_link_id") WHERE "reports"."share_link_id" is not null;--> statement-breakpoint
CREATE INDEX "reports_target_user_idx" ON "reports" USING btree ("target_user_id") WHERE "reports"."target_user_id" is not null;--> statement-breakpoint
CREATE INDEX "reports_reporter_user_idx" ON "reports" USING btree ("reporter_user_id") WHERE "reports"."reporter_user_id" is not null;--> statement-breakpoint
CREATE INDEX "share_links_media_idx" ON "share_links" USING btree ("media_id") WHERE "share_links"."media_id" is not null;--> statement-breakpoint
CREATE INDEX "share_links_folder_idx" ON "share_links" USING btree ("folder_id") WHERE "share_links"."folder_id" is not null;--> statement-breakpoint
CREATE INDEX "training_photos_user_idx" ON "training_photos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_created_idx" ON "user" USING btree ("created_at","id");