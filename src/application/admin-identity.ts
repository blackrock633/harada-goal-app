import { z } from 'zod';

/**
 * Operator views of the Founding 100 and community health (admin_founding_members(), admin_search_users(),
 * admin_community_metrics()). The database decides who may read them; these parsers only shape the answers.
 */

const foundingOverviewSchema = z.object({
  capacity: z.number(),
  remaining: z.number(),
  nextNumber: z.number().nullable(),
  members: z.array(
    z.object({
      userId: z.string(),
      memberNumber: z.number(),
      approvedAt: z.string(),
      username: z.string(),
      displayName: z.string(),
      approvedBy: z.string().nullable(),
    }),
  ),
  audit: z.array(
    z.object({
      id: z.number(),
      action: z.string(),
      reason: z.string(),
      occurredAt: z.string(),
      actor: z.string().nullable(),
      target: z.string().nullable(),
    }),
  ),
});

export type FoundingOverviewDTO = z.infer<typeof foundingOverviewSchema>;

export function parseFoundingOverview(raw: unknown): FoundingOverviewDTO | null {
  const r = foundingOverviewSchema.safeParse(raw);
  return r.success ? r.data : null;
}

const memberSearchSchema = z.object({
  items: z.array(
    z.object({
      userId: z.string(),
      username: z.string(),
      displayName: z.string(),
      joinedAt: z.string(),
      foundingMemberNumber: z.number().nullable(),
    }),
  ),
});

export type MemberSearchResultDTO = z.infer<typeof memberSearchSchema>['items'][number];

export function parseMemberSearch(raw: unknown): MemberSearchResultDTO[] | null {
  const r = memberSearchSchema.safeParse(raw);
  return r.success ? r.data.items : null;
}

const communityMetricsSchema = z.object({
  events30d: z.record(z.string(), z.object({ count: z.number(), users: z.number() })),
  returningMembers28d: z.number(),
  achievements: z.record(z.string(), z.number()),
  publicProfiles: z.number(),
  publicGoals: z.number(),
  foundingMembers: z.number(),
});

export type CommunityMetricsDTO = z.infer<typeof communityMetricsSchema>;

export function parseCommunityMetrics(raw: unknown): CommunityMetricsDTO | null {
  const r = communityMetricsSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** An audit reason as the database requires it (3 to 500 characters). */
export const auditReasonSchema = z
  .string()
  .trim()
  .min(3, 'Give a reason (at least 3 characters)')
  .max(500, 'Keep it under 500 characters');
