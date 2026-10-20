CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"goal_id" uuid NOT NULL,
	"outcome_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"position" smallint,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"schedule_type" text,
	"schedule_days" smallint[],
	"schedule_times_per_week" smallint,
	"start_date" date,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actions_title_len_check" CHECK (char_length(title) between 1 and 160),
	CONSTRAINT "actions_kind_check" CHECK (kind in ('task','routine')),
	CONSTRAINT "actions_position_check" CHECK (position between 0 and 107),
	CONSTRAINT "actions_position_archive_check" CHECK ((position is null) = (archived_at is not null)),
	CONSTRAINT "actions_schedule_type_check" CHECK (schedule_type is null or schedule_type in ('daily','weekdays','weekly')),
	CONSTRAINT "actions_weekly_times_check" CHECK (schedule_times_per_week is null or (schedule_times_per_week between 1 and 7)),
	CONSTRAINT "actions_kind_consistency_check" CHECK (
      (kind = 'task' and schedule_type is null and start_date is null) or
      (kind = 'routine' and schedule_type is not null and start_date is not null and due_date is null and completed_at is null)
    )
);
--> statement-breakpoint
CREATE TABLE "goal_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"goal_id" uuid NOT NULL,
	"type" text NOT NULL,
	"subject_id" uuid,
	"summary" text NOT NULL,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"vision" text DEFAULT '' NOT NULL,
	"target_date" date,
	"status" text NOT NULL,
	"status_before_archive" text,
	"purpose_self_tangible" text DEFAULT '' NOT NULL,
	"purpose_self_intangible" text DEFAULT '' NOT NULL,
	"purpose_others_tangible" text DEFAULT '' NOT NULL,
	"purpose_others_intangible" text DEFAULT '' NOT NULL,
	"activated_on" date,
	"achieved_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_title_len_check" CHECK (char_length(title) between 1 and 120),
	CONSTRAINT "goals_status_check" CHECK (status in ('draft','active','achieved','archived')),
	CONSTRAINT "goals_status_before_archive_check" CHECK (status_before_archive is null or status_before_archive in ('draft','active','achieved')),
	CONSTRAINT "goals_archive_consistency_check" CHECK ((status = 'archived') = (archived_at is not null and status_before_archive is not null))
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"goal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"measure_target" numeric,
	"measure_current" numeric,
	"measure_unit" text,
	"position" smallint,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcomes_title_len_check" CHECK (char_length(title) between 1 and 120),
	CONSTRAINT "outcomes_measure_check" CHECK ((measure_target is null and measure_current is null and measure_unit is null) or (measure_target is not null and measure_current is not null and measure_target > 0 and measure_current >= 0)),
	CONSTRAINT "outcomes_position_check" CHECK (position between 0 and 107),
	CONSTRAINT "outcomes_position_archive_check" CHECK ((position is null) = (archived_at is not null))
);
--> statement-breakpoint
CREATE TABLE "reflections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"goal_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"went_well" text DEFAULT '' NOT NULL,
	"didnt_go_well" text DEFAULT '' NOT NULL,
	"next_change" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reflections_kind_check" CHECK (kind in ('daily','weekly'))
);
--> statement-breakpoint
CREATE TABLE "routine_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"action_id" uuid NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_outcome_id_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."outcomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_events" ADD CONSTRAINT "goal_events_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_checks" ADD CONSTRAINT "routine_checks_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_goal_idx" ON "actions" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "actions_outcome_idx" ON "actions" USING btree ("outcome_id");--> statement-breakpoint
CREATE UNIQUE INDEX "actions_outcome_position_unique" ON "actions" USING btree ("outcome_id","position") WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "goal_events_goal_time_idx" ON "goal_events" USING btree ("goal_id","occurred_at");--> statement-breakpoint
CREATE INDEX "goals_owner_status_idx" ON "goals" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "outcomes_goal_idx" ON "outcomes" USING btree ("goal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outcomes_goal_position_unique" ON "outcomes" USING btree ("goal_id","position") WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "reflections_goal_date_idx" ON "reflections" USING btree ("goal_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_checks_action_date_unique" ON "routine_checks" USING btree ("action_id","date");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");