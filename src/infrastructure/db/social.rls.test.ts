import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as uc from '@/application/use-cases';
import type { Ctx } from '@/application/result';
import { createTestDeps, type TestDeps } from '../testing/create-test-deps';

describe('Social community system (profiles, following, feed, sharing, privacy, engagement)', () => {
  let t: TestDeps;
  let aliceId: string;
  let bobId: string;
  let carolId: string;
  let today: string;

  const ctxFor = (userId: string): Ctx => ({ userId, now: new Date(), today });

  beforeAll(async () => {
    t = await createTestDeps();
    aliceId = await t.createUser({ email: 'alice@example.com', displayName: 'Alice Runner' });
    bobId = await t.createUser({ email: 'bob@example.com', displayName: 'Bob Builder' });
    carolId = await t.createUser({ email: 'carol@example.com', displayName: 'Carol Writer' });
    today = (
      await t.client.query<{ d: string }>(`select to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') as d`)
    ).rows[0]!.d;
  });

  afterAll(async () => {
    await t.close();
  });

  describe('1. User Profiles & Usernames', () => {
    it('automatically creates a social profile with a valid unique username on sign-up and never exposes email', async () => {
      const res = await uc.getSocialProfile(t.deps, ctxFor(aliceId));
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.userId).toBe(aliceId);
      expect(res.data.displayName).toBe('Alice Runner');
      expect(res.data.username).toMatch(/^alice_runner_[a-f0-9]{6}$/);
      expect(res.data.isOwnProfile).toBe(true);
      expect(JSON.stringify(res.data)).not.toContain('alice@example.com');
    });

    it('allows authenticated users to update their own profile fields and avatar', async () => {
      const validPngDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
      const res = await uc.updateSocialProfile(t.deps, ctxFor(aliceId), {
        displayName: 'Alice Marathon',
        username: 'alice_runs',
        bio: 'Training for a sub-3:30 marathon.',
        location: 'Boulder, CO',
        website: 'https://alice.example.com',
        avatarUrl: validPngDataUrl,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data).toMatchObject({
        displayName: 'Alice Marathon',
        username: 'alice_runs',
        bio: 'Training for a sub-3:30 marathon.',
        location: 'Boulder, CO',
        website: 'https://alice.example.com',
        avatarUrl: validPngDataUrl,
      });

      // Replace and remove avatar
      const removed = await uc.updateSocialProfile(t.deps, ctxFor(aliceId), { avatarUrl: null });
      expect(removed.ok && removed.data.avatarUrl).toBeNull();
    });

    it('enforces unique usernames and rejects reserved or malformed usernames, invalid URLs, and unsafe avatars', async () => {
      const dup = await uc.updateSocialProfile(t.deps, ctxFor(bobId), { username: 'ALICE_RUNS' });
      expect(dup).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

      const reserved = await uc.updateSocialProfile(t.deps, ctxFor(bobId), { username: 'settings' });
      expect(reserved).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

      const badChars = await uc.updateSocialProfile(t.deps, ctxFor(bobId), { username: 'bob!@#' });
      expect(badChars).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

      const jsWebsite = await uc.updateSocialProfile(t.deps, ctxFor(bobId), { website: 'javascript:alert(1)' });
      expect(jsWebsite).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

      const svgAvatar = await uc.updateSocialProfile(t.deps, ctxFor(bobId), {
        avatarUrl: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+',
      });
      expect(svgAvatar).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

      // Photos are JPEGs only, checked by their bytes: no PNG, no disguised content, no remote URLs.
      for (const avatarUrl of [
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'data:image/jpeg;base64,PGh0bWw+PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0PjwvaHRtbD4=',
        'https://tracker.example.com/pixel.jpg',
      ]) {
        expect(await uc.updateSocialProfile(t.deps, ctxFor(bobId), { avatarUrl })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
      }
      // And the database refuses them even if the application check were skipped.
      await expect(t.client.query(`update social_profiles set avatar_url = 'https://tracker.example.com/p.jpg' where user_id = $1`, [bobId])).rejects.toThrow();

      // Valid update for Bob and Carol
      expect((await uc.updateSocialProfile(t.deps, ctxFor(bobId), { username: 'bob_builds' })).ok).toBe(true);
      expect((await uc.updateSocialProfile(t.deps, ctxFor(carolId), { username: 'carol_writes' })).ok).toBe(true);
    });

    it('prevents users from modifying another user profile even via direct SQL / RPC', async () => {
      // update_social_profile always uses auth.uid() and ignores any extra userId field passed in JSON
      const res = await t.deps.uow.run(bobId, (r) =>
        r.social.callRpc<{ userId: string; bio: string }>('update_social_profile', {
          userId: aliceId,
          bio: 'Attempted hijack',
        }),
      );
      expect(res.userId).toBe(bobId);
      const alice = await uc.getSocialProfile(t.deps, ctxFor(bobId), { username: 'alice_runs' });
      expect(alice.ok && alice.data.bio).toBe('Training for a sub-3:30 marathon.');
    });
  });

  describe('2. Following System & Discovery', () => {
    it('prevents self-follow and duplicate follows, and updates follower/following counts accurately', async () => {
      const selfFollow = await uc.followUser(t.deps, ctxFor(bobId), { targetUserId: bobId });
      expect(selfFollow).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

      const f1 = await uc.followUser(t.deps, ctxFor(bobId), { targetUserId: aliceId });
      expect(f1).toEqual({ ok: true, data: { following: true, followersCount: 1, followingCount: 1 } });

      // Duplicate follow is idempotent and does not inflate counts
      const f2 = await uc.followUser(t.deps, ctxFor(bobId), { targetUserId: aliceId });
      expect(f2).toEqual({ ok: true, data: { following: true, followersCount: 1, followingCount: 1 } });

      const followers = await uc.listFollowConnections(t.deps, ctxFor(aliceId), {
        kind: 'followers',
        userId: aliceId,
      });
      expect(followers.ok && followers.data.items.map((x) => x.username)).toEqual(['bob_builds']);

      const following = await uc.listFollowConnections(t.deps, ctxFor(bobId), {
        kind: 'following',
        userId: bobId,
      });
      expect(following.ok && following.data.items.map((x) => x.username)).toEqual(['alice_runs']);
    });

    it('supports unfollowing without deleting either user content', async () => {
      await uc.followUser(t.deps, ctxFor(carolId), { targetUserId: aliceId });
      const un = await uc.unfollowUser(t.deps, ctxFor(carolId), { targetUserId: aliceId });
      expect(un).toEqual({ ok: true, data: { following: false, followersCount: 1, followingCount: 0 } });
    });

    it('supports user discovery by username, display name, and suggested profiles', async () => {
      const search = await uc.discoverUsers(t.deps, ctxFor(carolId), { query: 'alice_runs' });
      expect(search.ok && search.data.users.map((u) => u.username)).toContain('alice_runs');

      const suggestions = await uc.discoverUsers(t.deps, ctxFor(carolId), {});
      expect(suggestions.ok && suggestions.data.users.map((u) => u.username)).toContain('alice_runs');
    });
  });

  describe('3. Goal Visibility, Post Sharing, Feed, and Privacy Enforcement', () => {
    let privateGoalId: string;
    let publicGoalId: string;

    it('defaults new goals to private and hides private goals from other users profiles and stats', async () => {
      const g1 = await uc.createGoal(t.deps, ctxFor(aliceId), {
        title: 'Secret Personal Goal',
        vision: 'Private notes that must never leak',
      });
      expect(g1.ok).toBe(true);
      if (!g1.ok) return;
      privateGoalId = g1.data.id;

      const vis = await uc.getGoalVisibility(t.deps, ctxFor(aliceId), { goalId: privateGoalId });
      expect(vis).toEqual({ ok: true, data: { goalId: privateGoalId, visibility: 'private' } });

      // Bob views Alice's profile: private goal is NOT in publicGoals or stats
      const profForBob = await uc.getSocialProfile(t.deps, ctxFor(bobId), { username: 'alice_runs' });
      expect(profForBob.ok).toBe(true);
      if (!profForBob.ok) return;
      expect(profForBob.data.publicGoals).toEqual([]);
      expect(profForBob.data.ownGoals).toEqual([]);
      expect(JSON.stringify(profForBob.data)).not.toContain('Secret Personal Goal');
    });

    it('blocks publishing a public post linked to a private goal unless makeGoalPublic is explicitly set', async () => {
      const accidental = await uc.createSocialPost(t.deps, ctxFor(aliceId), {
        type: 'progress_update',
        goalId: privateGoalId,
        visibility: 'public',
        body: 'Working on my goal!',
      });
      expect(accidental).toMatchObject({ ok: false, error: { code: 'INVALID_STATE' } });

      // Alice creates a second goal, activates it, completes a task, and makes it public
      const g2 = await uc.createGoal(t.deps, ctxFor(aliceId), {
        title: 'Run a 3:30 Marathon',
      });
      expect(g2.ok).toBe(true);
      if (!g2.ok) return;
      publicGoalId = g2.data.id;

      const o = await uc.addOutcome(t.deps, ctxFor(aliceId), { goalId: publicGoalId, title: 'Endurance' });
      expect(o.ok).toBe(true);
      if (!o.ok) return;
      const a = await uc.addAction(t.deps, ctxFor(aliceId), {
        outcomeId: o.data.id,
        title: '20-mile long run',
        kind: 'task',
      });
      expect(a.ok).toBe(true);
      if (!a.ok) return;
      await uc.activateGoal(t.deps, ctxFor(aliceId), { goalId: publicGoalId });
      await uc.completeAction(t.deps, ctxFor(aliceId), { actionId: a.data.id });

      const setPub = await uc.setGoalVisibility(t.deps, ctxFor(aliceId), {
        goalId: publicGoalId,
        visibility: 'public',
      });
      expect(setPub).toEqual({ ok: true, data: { goalId: publicGoalId, visibility: 'public' } });

      // Bob cannot change Alice's goal visibility
      const bobAttempt = await uc.setGoalVisibility(t.deps, ctxFor(bobId), {
        goalId: privateGoalId,
        visibility: 'public',
      });
      expect(bobAttempt).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    });

    it('publishes progress updates, milestones, and goal completions with server-computed stats', async () => {
      const p1 = await uc.createSocialPost(t.deps, ctxFor(aliceId), {
        type: 'progress_update',
        goalId: publicGoalId,
        visibility: 'public',
        headline: 'Week 8 long run finished',
        body: 'Felt strong on the hills today.',
        includeStats: true,
      });
      expect(p1.ok).toBe(true);
      if (!p1.ok) return;
      expect(p1.data.goal?.title).toBe('Run a 3:30 Marathon');
      expect(p1.data.stats).toMatchObject({ tasksDone: 1, tasksTotal: 1, keyAreas: 1 });

      // Mark goal achieved and share goal_completed post
      await uc.markGoalAchieved(t.deps, ctxFor(aliceId), { goalId: publicGoalId });
      const p2 = await uc.createSocialPost(t.deps, ctxFor(aliceId), {
        type: 'goal_completed',
        goalId: publicGoalId,
        visibility: 'public',
        body: 'Crossed the finish line in 3:28!',
      });
      expect(p2.ok).toBe(true);
      if (!p2.ok) return;
      expect(p2.data.type).toBe('goal_completed');
      expect(p2.data.headline).toContain('Run a 3:30 Marathon');

      // Private post by Alice
      const pPrivate = await uc.createSocialPost(t.deps, ctxFor(aliceId), {
        type: 'general_achievement',
        visibility: 'private',
        headline: 'Personal journal milestone',
        body: 'Only for me',
      });
      expect(pPrivate.ok).toBe(true);
      if (!pPrivate.ok) return;

      // Bob (who follows Alice) sees p2 and p1 in his following feed, but NEVER pPrivate
      const bobFeed = await uc.getSocialFeed(t.deps, ctxFor(bobId), { scope: 'following', limit: 1 });
      expect(bobFeed.ok).toBe(true);
      if (!bobFeed.ok) return;
      expect(bobFeed.data.items).toHaveLength(1);
      expect(bobFeed.data.items[0]!.id).toBe(p2.data.id);
      expect(bobFeed.data.nextCursor).not.toBeNull();

      // Page 2 via cursor pagination
      const bobFeedPage2 = await uc.getSocialFeed(t.deps, ctxFor(bobId), {
        scope: 'following',
        limit: 5,
        before: bobFeed.data.nextCursor!.before,
        beforeId: bobFeed.data.nextCursor!.beforeId,
      });
      expect(bobFeedPage2.ok && bobFeedPage2.data.items.map((x) => x.id)).toEqual([p1.data.id]);

      // Bob cannot fetch Alice's private post directly by ID
      const directPrivate = await uc.getSocialPost(t.deps, ctxFor(bobId), { postId: pPrivate.data.id });
      expect(directPrivate).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    });

    it('retroactively hides old posts when their linked goal is switched from public to private or deleted', async () => {
      // Switch Alice's marathon goal back to private
      await uc.setGoalVisibility(t.deps, ctxFor(aliceId), { goalId: publicGoalId, visibility: 'private' });

      const bobFeed = await uc.getSocialFeed(t.deps, ctxFor(bobId), { scope: 'following' });
      expect(bobFeed.ok && bobFeed.data.items).toEqual([]);

      const profForBob = await uc.getSocialProfile(t.deps, ctxFor(bobId), { username: 'alice_runs' });
      expect(profForBob.ok && profForBob.data.publicGoals).toEqual([]);
      expect(profForBob.ok && profForBob.data.recentPosts).toEqual([]);
      expect(JSON.stringify(profForBob)).not.toContain('Run a 3:30 Marathon');

      // Switch it back to public so Bob can see it again
      await uc.setGoalVisibility(t.deps, ctxFor(aliceId), { goalId: publicGoalId, visibility: 'public' });
      const bobFeedRestored = await uc.getSocialFeed(t.deps, ctxFor(bobId), { scope: 'following' });
      expect(bobFeedRestored.ok && bobFeedRestored.data.items).toHaveLength(2);
    });

    it('serves a post photo only to viewers who may see the post, and never inside the feed', async () => {
      const post = await uc.createSocialPost(t.deps, ctxFor(aliceId), {
        type: 'progress_update', goalId: publicGoalId, visibility: 'public', headline: 'Photo update', imageUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      });
      expect(post.ok).toBe(true);
      if (!post.ok) return;
      expect(post.data.hasImage).toBe(true);
      const feed = await uc.getSocialFeed(t.deps, ctxFor(bobId), { scope: 'following' });
      expect(JSON.stringify(feed)).not.toContain('base64');
      expect(await uc.getPostImage(t.deps, ctxFor(bobId), { postId: post.data.id })).toMatchObject({ ok: true, data: { image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=' } });

      // The goal turns private: the photo goes with the post, for everyone but the author.
      await uc.setGoalVisibility(t.deps, ctxFor(aliceId), { goalId: publicGoalId, visibility: 'private' });
      expect(await uc.getPostImage(t.deps, ctxFor(bobId), { postId: post.data.id })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect((await uc.getPostImage(t.deps, ctxFor(aliceId), { postId: post.data.id })).ok).toBe(true);
      await uc.setGoalVisibility(t.deps, ctxFor(aliceId), { goalId: publicGoalId, visibility: 'public' });
      await uc.deleteSocialPost(t.deps, ctxFor(aliceId), { postId: post.data.id });
      expect(await uc.getPostImage(t.deps, ctxFor(bobId), { postId: post.data.id })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    });

    it('enforces post ownership for edit and delete, and deleting a post does not delete the goal', async () => {
      const tempPost = await uc.createSocialPost(t.deps, ctxFor(aliceId), {
        type: 'milestone',
        goalId: publicGoalId,
        headline: 'Halfway milestone',
      });
      expect(tempPost.ok).toBe(true);
      if (!tempPost.ok) return;

      // Bob cannot edit or delete Alice's post
      expect(
        await uc.updateSocialPost(t.deps, ctxFor(bobId), { postId: tempPost.data.id, headline: 'Hacked' }),
      ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(await uc.deleteSocialPost(t.deps, ctxFor(bobId), { postId: tempPost.data.id })).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });

      // Alice deletes her post; her goal still exists intact
      const del = await uc.deleteSocialPost(t.deps, ctxFor(aliceId), { postId: tempPost.data.id });
      expect(del.ok).toBe(true);
      const goalStillThere = await t.deps.uow.run(aliceId, (r) => r.goals.findById(aliceId, publicGoalId));
      expect(goalStillThere?.title).toBe('Run a 3:30 Marathon');
    });

    it('scrubs old posts when a goal is permanently deleted so deleted goals never leak', async () => {
      const tempGoal = await uc.createGoal(t.deps, ctxFor(aliceId), { title: 'Temporary Public Goal' });
      expect(tempGoal.ok).toBe(true);
      if (!tempGoal.ok) return;
      await uc.setGoalVisibility(t.deps, ctxFor(aliceId), { goalId: tempGoal.data.id, visibility: 'public' });
      const postOnTemp = await uc.createSocialPost(t.deps, ctxFor(aliceId), {
        type: 'goal_started',
        goalId: tempGoal.data.id,
        visibility: 'public',
      });
      expect(postOnTemp.ok).toBe(true);
      if (!postOnTemp.ok) return;

      // Archive and permanently delete the goal
      await uc.archiveGoal(t.deps, ctxFor(aliceId), { goalId: tempGoal.data.id });
      await uc.deleteGoalPermanently(t.deps, ctxFor(aliceId), {
        goalId: tempGoal.data.id,
        confirmTitle: 'Temporary Public Goal',
      });

      // Bob cannot see the post or the deleted goal's title anywhere
      const bobView = await uc.getSocialPost(t.deps, ctxFor(bobId), { postId: postOnTemp.data.id });
      expect(bobView).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      const bobFeed = await uc.getSocialFeed(t.deps, ctxFor(bobId), { scope: 'following' });
      expect(JSON.stringify(bobFeed)).not.toContain('Temporary Public Goal');
    });
  });

  describe('4. Likes, Comments, Moderation, Notifications, and Blocking', () => {
    let targetPostId: string;

    it('prevents duplicate likes and keeps like counts accurate', async () => {
      const feed = await uc.getSocialFeed(t.deps, ctxFor(bobId), { scope: 'following' });
      expect(feed.ok).toBe(true);
      if (!feed.ok) return;
      targetPostId = feed.data.items[0]!.id;

      const l1 = await uc.togglePostLike(t.deps, ctxFor(bobId), { postId: targetPostId, like: true });
      expect(l1).toEqual({ ok: true, data: { postId: targetPostId, liked: true, likeCount: 1 } });

      // Duplicate like stays at 1
      const l2 = await uc.togglePostLike(t.deps, ctxFor(bobId), { postId: targetPostId, like: true });
      expect(l2).toEqual({ ok: true, data: { postId: targetPostId, liked: true, likeCount: 1 } });

      // Unlike drops to 0
      const un = await uc.togglePostLike(t.deps, ctxFor(bobId), { postId: targetPostId, like: false });
      expect(un).toEqual({ ok: true, data: { postId: targetPostId, liked: false, likeCount: 0 } });

      // Re-like
      await uc.togglePostLike(t.deps, ctxFor(bobId), { postId: targetPostId, like: true });
    });

    it('validates comments, allows comment author and post owner to delete, and blocks third-party deletion', async () => {
      const empty = await uc.addPostComment(t.deps, ctxFor(bobId), { postId: targetPostId, body: '   ' });
      expect(empty).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

      const oversized = await uc.addPostComment(t.deps, ctxFor(bobId), {
        postId: targetPostId,
        body: 'x'.repeat(501),
      });
      expect(oversized).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

      const c1 = await uc.addPostComment(t.deps, ctxFor(bobId), {
        postId: targetPostId,
        body: 'Incredible consistency, Alice!',
      });
      expect(c1.ok).toBe(true);
      if (!c1.ok) return;
      expect(c1.data.commentCount).toBe(1);

      // Carol (neither comment author nor post owner) cannot delete Bob's comment
      const carolDel = await uc.deletePostComment(t.deps, ctxFor(carolId), { commentId: c1.data.comment.id });
      expect(carolDel).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

      // Alice (post owner) CAN moderate/delete Bob's comment on her post
      const aliceModDel = await uc.deletePostComment(t.deps, ctxFor(aliceId), { commentId: c1.data.comment.id });
      expect(aliceModDel).toMatchObject({ ok: true, data: { deleted: true, commentCount: 0 } });
    });

    it('delivers recipient-scoped notifications and marks them read', async () => {
      const aliceNotifs = await uc.listSocialNotifications(t.deps, ctxFor(aliceId));
      expect(aliceNotifs.ok).toBe(true);
      if (!aliceNotifs.ok) return;
      expect(aliceNotifs.data.items.length).toBeGreaterThan(0);
      expect(aliceNotifs.data.unreadCount).toBeGreaterThan(0);

      // Carol cannot see Alice's notifications
      const carolNotifs = await uc.listSocialNotifications(t.deps, ctxFor(carolId));
      expect(carolNotifs.ok && carolNotifs.data.items).toEqual([]);

      const marked = await uc.markNotificationsRead(t.deps, ctxFor(aliceId), {});
      expect(marked).toEqual({ ok: true, data: { unreadCount: 0 } });
    });

    it('enforces blocking across profiles, follows, feeds, and interactions', async () => {
      await uc.blockUser(t.deps, ctxFor(aliceId), { targetUserId: bobId });

      // Follow relationship is severed and Bob can no longer view Alice's profile or posts
      const bobViewsAlice = await uc.getSocialProfile(t.deps, ctxFor(bobId), { username: 'alice_runs' });
      expect(bobViewsAlice).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

      const bobTriesFollow = await uc.followUser(t.deps, ctxFor(bobId), { targetUserId: aliceId });
      expect(bobTriesFollow).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

      const bobTriesLike = await uc.togglePostLike(t.deps, ctxFor(bobId), { postId: targetPostId });
      expect(bobTriesLike).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

      // Unblock restores visibility
      await uc.unblockUser(t.deps, ctxFor(aliceId), { targetUserId: bobId });
      const bobViewsAgain = await uc.getSocialProfile(t.deps, ctxFor(bobId), { username: 'alice_runs' });
      expect(bobViewsAgain.ok).toBe(true);
    });
  });
});
