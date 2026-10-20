import { createReflection, updateReflection as domainUpdate } from '@/domain/reflection';
import { DomainError } from '@/domain/errors';
import type { ReflectionDTO } from '../dto';
import { AppFail, STALE_MESSAGE, guard, notFound } from '../errors';
import type { Deps } from '../ports';
import type { Ctx, Result } from '../result';
import { addReflectionSchema, reflectionIdSchema, updateReflectionSchema } from '../schemas';
import { reflectionDTO } from '../queries/assemble';
import { assertFresh, lockGoal } from './shared';

export async function addReflection(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<ReflectionDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const data = addReflectionSchema.parse(input);
      const goal = await lockGoal(repos, ctx, data.goalId, { editable: false });
      if (data.id) {
        const existing = await repos.reflections.findById(ctx.userId, data.id);
        if (existing) {
          if (existing.goalId !== goal.id) throw new AppFail('CONFLICT', STALE_MESSAGE);
          return reflectionDTO(existing);
        }
      }
      const reflection = createReflection({ ...data, id: data.id ?? deps.ids() }, ctx.today, ctx.now);
      await repos.reflections.insert(reflection);
      return reflectionDTO(reflection);
    }),
  );
}

export async function updateReflection(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<ReflectionDTO>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { reflectionId, expectedUpdatedAt, date, kind, ...fields } = updateReflectionSchema.parse(input);
      const current = await repos.reflections.findById(ctx.userId, reflectionId);
      if (!current) throw notFound();
      assertFresh(current.updatedAt, expectedUpdatedAt);
      if (date !== undefined && date > ctx.today) {
        throw new DomainError('VALIDATION', 'Reflection date cannot be in the future', 'date');
      }
      const { reflection } = domainUpdate(current, fields, ctx.today, ctx.now);
      let next = reflection;
      if ((date !== undefined && date !== current.date) || (kind !== undefined && kind !== current.kind)) {
        next = { ...next, date: date ?? current.date, kind: kind ?? current.kind, updatedAt: ctx.now };
      }
      if (next !== current) await repos.reflections.update(next);
      return reflectionDTO(next);
    }),
  );
}

export async function deleteReflection(deps: Deps, ctx: Ctx, input: unknown): Promise<Result<null>> {
  return guard(deps.logger, () =>
    deps.uow.run(ctx.userId, async (repos) => {
      const { reflectionId } = reflectionIdSchema.parse(input);
      const current = await repos.reflections.findById(ctx.userId, reflectionId);
      if (!current) throw notFound();
      await repos.reflections.deleteById(reflectionId);
      return null;
    }),
  );
}
