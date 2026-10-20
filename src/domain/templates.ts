import { Goal, Outcome, Action, Id, Instant, LocalDate } from './types.js';

import { createGoal } from './goal.js';
import { createOutcome } from './outcome.js';
import { createAction } from './action.js';

export interface TemplateAction {
  title: string;
  kind: 'task' | 'routine';
  schedule?: { type: 'daily' } | { type: 'weekdays', days: (0|1|2|3|4|5|6)[] } | { type: 'weekly', timesPerWeek: number };
}

export interface TemplateOutcome {
  title: string;
  description: string;
  measure?: { target: number; current: number; unit: string };
  actions: TemplateAction[];
}

export interface Template {
  id: string;
  name: string;
  summary: string;
  goalTitle: string;
  vision: string;
  purpose: { selfTangible: string; selfIntangible: string; othersTangible: string; othersIntangible: string };
  outcomes: TemplateOutcome[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'marathon',
    name: 'Run a marathon',
    summary: 'A proven plan to go from zero to marathon finisher over 16 weeks.',
    goalTitle: 'Finish the City Marathon',
    vision: 'Crossing the finish line feeling exhausted but triumphant, knowing I pushed my limits and achieved something incredible.',
    purpose: {
      selfTangible: 'Finish the race without walking',
      selfIntangible: 'Build mental resilience and discipline',
      othersTangible: 'Raise $1000 for charity',
      othersIntangible: 'Inspire my family to live a healthier lifestyle'
    },
    outcomes: [
      {
        title: 'Endurance Base',
        description: 'Build aerobic capacity to comfortably run long distances.',
        measure: { target: 32, current: 0, unit: 'km long run' },
        actions: [
          { title: 'Weekly long run', kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 1 } },
          { title: 'Zone 2 easy runs', kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 2 } },
          { title: 'Buy proper running shoes', kind: 'task' }
        ]
      },
      {
        title: 'Nutrition & Recovery',
        description: 'Fuel the body properly and avoid injury.',
        actions: [
          { title: 'Post-run stretching (15m)', kind: 'routine', schedule: { type: 'daily' } },
          { title: 'Drink 3L water', kind: 'routine', schedule: { type: 'daily' } },
          { title: 'Research race-day fueling strategy', kind: 'task' }
        ]
      }
    ]
  },
  {
    id: 'product-launch',
    name: 'Launch a product',
    summary: 'Ship your side project and get your first 100 paying users.',
    goalTitle: 'Launch v1 and acquire 100 customers',
    vision: 'Seeing notifications of new customers signing up while I sleep, knowing I built something people value.',
    purpose: {
      selfTangible: '$1k MRR',
      selfIntangible: 'Confidence in my entrepreneurial ability',
      othersTangible: 'Provide a tool that saves people time',
      othersIntangible: 'Contribute to the indie maker community'
    },
    outcomes: [
      {
        title: 'MVP Development',
        description: 'Build only the essential features needed to solve the core problem.',
        measure: { target: 100, current: 0, unit: '% complete' },
        actions: [
          { title: 'Write code', kind: 'routine', schedule: { type: 'weekdays', days: [1,2,3,4,5] } },
          { title: 'Finalise database schema', kind: 'task' },
          { title: 'Set up Stripe billing', kind: 'task' }
        ]
      },
      {
        title: 'Marketing & Distribution',
        description: 'Get the product in front of the right audience.',
        actions: [
          { title: 'Post update on X/Twitter', kind: 'routine', schedule: { type: 'daily' } },
          { title: 'Reach out to 5 potential users', kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 5 } },
          { title: 'Publish Product Hunt launch page', kind: 'task' }
        ]
      }
    ]
  },
  {
    id: 'varsity-soccer',
    name: 'Make the varsity soccer roster',
    summary: 'Develop the technical skills and fitness required to impress coaches at tryouts.',
    goalTitle: 'Make the Varsity Soccer Team',
    vision: 'Hearing my name called when the final roster is announced and stepping onto the field in the varsity kit.',
    purpose: {
      selfTangible: 'Earn a starting position',
      selfIntangible: 'Develop strong leadership skills',
      othersTangible: 'Help the team reach the playoffs',
      othersIntangible: 'Be a role model for younger players'
    },
    outcomes: [
      {
        title: 'Technical Mastery',
        description: 'Improve first touch and passing accuracy under pressure.',
        actions: [
          { title: 'Wall passing drills (20m)', kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 4 } },
          { title: 'Juggling sequence practice', kind: 'routine', schedule: { type: 'daily' } }
        ]
      },
      {
        title: 'Physical Fitness',
        description: 'Achieve the stamina to play a full 90 minutes effectively.',
        measure: { target: 12, current: 0, unit: 'beep test level' },
        actions: [
          { title: 'Interval sprint training', kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 2 } },
          { title: 'Core strength workout', kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 3 } }
        ]
      }
    ]
  },
  {
    id: '4-0-gpa',
    name: 'Earn a 4.0 GPA',
    summary: 'Master study habits and time management to excel academically this semester.',
    goalTitle: 'Achieve a 4.0 GPA this semester',
    vision: 'Opening my final transcript and seeing straight As, feeling proud of my dedication.',
    purpose: {
      selfTangible: 'Qualify for academic scholarships',
      selfIntangible: 'Build a lifelong love of learning',
      othersTangible: 'Make my family proud',
      othersIntangible: 'Help classmates understand difficult concepts'
    },
    outcomes: [
      {
        title: 'Consistent Study Habits',
        description: 'Stay ahead of assignments and avoid cramming.',
        actions: [
          { title: 'Review notes after class', kind: 'routine', schedule: { type: 'weekdays', days: [1,2,3,4,5] } },
          { title: 'Deep work study session (2h)', kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 5 } },
          { title: 'Plan weekly schedule on Sunday', kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 1 } }
        ]
      },
      {
        title: 'Active Participation',
        description: 'Engage with professors and peers to deepen understanding.',
        actions: [
          { title: 'Attend office hours', kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 1 } },
          { title: 'Ask at least one question per class', kind: 'routine', schedule: { type: 'weekdays', days: [1,2,3,4,5] } }
        ]
      }
    ]
  }
];

export function instantiateTemplate(
  templateId: string,
  ctx: { ownerId: Id; ids: () => Id; today: LocalDate; now: Instant }
): { goal: Goal; outcomes: Outcome[]; actions: Action[] } {
  const t = TEMPLATES.find(x => x.id === templateId);
  if (!t) throw new Error('Template not found');

  const goalId = ctx.ids();
  const goal = createGoal({
    id: goalId,
    ownerId: ctx.ownerId,
    title: t.goalTitle,
    vision: t.vision,
    purpose: t.purpose
  }, ctx.now);

  const outcomes: Outcome[] = [];
  const actions: Action[] = [];

  for (const ot of t.outcomes) {
    const outcomeId = ctx.ids();
    const outcome = createOutcome({
      id: outcomeId,
      goalId,
      title: ot.title,
      description: ot.description,
      measure: ot.measure ? { ...ot.measure } : null
    }, outcomes, ctx.now);
    outcomes.push(outcome);

    const activeSiblingsInOutcome: Action[] = [];
    for (const at of ot.actions) {
      const actionId = ctx.ids();
      const action = createAction({
        id: actionId,
        goalId,
        outcomeId,
        title: at.title,
        kind: at.kind,
        schedule: at.schedule as any
      }, activeSiblingsInOutcome, ctx.today, ctx.now);
      
      activeSiblingsInOutcome.push(action);
      actions.push(action);
    }
  }

  return { goal, outcomes, actions };
}
