import { TEMPLATES } from '@shared/domain/templates';
import type { TemplateSummaryDTO } from '@shared/application/dto';

/** Same projection as the web's listTemplates query (templates ship with the app). */
export const TEMPLATE_SUMMARIES: TemplateSummaryDTO[] = TEMPLATES.map((t) => ({
  id: t.id,
  name: t.name,
  summary: t.summary,
  outcomeCount: t.outcomes.length,
  actionCount: t.outcomes.reduce((n, o) => n + o.actions.length, 0),
}));
