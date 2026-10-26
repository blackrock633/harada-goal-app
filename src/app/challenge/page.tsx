import type { Metadata } from 'next';
import { PublicShell } from '@/ui/features/marketing';
import { ButtonLink } from '@/ui/primitives';
import { routes } from '@/ui/routes';

export const metadata: Metadata = {
  title: '30-Day Challenge',
  description:
    'Thirty days of steady action on one goal: something small every day and a short review each week. Free for everyone.',
};

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: 'what',
    title: 'What it is',
    body: (
      <p>
        Thirty consecutive days of working on one goal from your Harada plan, counted in your own time zone. It’s free
        for everyone. Progress comes from what you actually do on the goal — tasks completed, routines checked,
        reflections written — so there’s nothing extra to log.
      </p>
    ),
  },
  {
    id: 'who',
    title: 'Who it’s for',
    body: (
      <p>
        Anyone who has a plan and wants to turn it into a habit of acting on it: a student before exams, a founder before
        a launch, someone returning to training, or anyone who keeps meaning to start.
      </p>
    ),
  },
  {
    id: 'daily',
    title: 'What you do each day',
    body: (
      <p>
        Open Today and do at least one thing for the goal: finish a task, check off a routine, or write a short note on
        what happened. Small days count. A missed day is simply a day without activity — the challenge keeps going and
        nobody has to start over.
      </p>
    ),
  },
  {
    id: 'weekly',
    title: 'What you do each week',
    body: (
      <p>
        Write a weekly review: what went well, what didn’t, and what you’ll change next week. Then adjust the plan — add,
        move or drop actions so next week’s work is the right work.
      </p>
    ),
  },
  {
    id: 'thirty',
    title: 'After 30 days',
    body: (
      <p>
        You get a summary of the month: the days you were active, the tasks you finished and the routines you kept, plus
        space for a closing reflection. You can share a card of it if you want to; nothing is shared unless you choose.
      </p>
    ),
  },
  {
    id: 'expect',
    title: 'What to expect',
    body: (
      <p>
        A steady execution habit and measurable progress, not a promise that the whole goal is done in 30 days. Most
        meaningful goals take longer than a month; the challenge is about building the rhythm that gets you there.
      </p>
    ),
  },
];

export default function ChallengePage() {
  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[720px] px-4 py-10 md:px-8 md:py-14">
        <p className="text-sm font-medium text-accent">Free for everyone</p>
        <h1 className="mt-1 font-serif text-3xl font-medium text-ink md:text-4xl">The 30-Day Challenge</h1>
        <p className="mt-3 text-lg text-ink-muted">
          One goal, thirty days, something small every day and a short review every week.
        </p>

        <div className="mt-10 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.id} aria-labelledby={`challenge-${s.id}`} className="border-t border-rule pt-4">
              <h2 id={`challenge-${s.id}`} className="font-serif text-xl text-ink md:text-2xl">{s.title}</h2>
              <div className="mt-2 text-ink-muted">{s.body}</div>
            </section>
          ))}

          <section aria-labelledby="challenge-join" className="border-t border-rule pt-4">
            <h2 id="challenge-join" className="font-serif text-xl text-ink md:text-2xl">How to join</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-muted">
              <li>Create a free account and set up a goal with at least a few actions, then activate it.</li>
              <li>In the Harada app, open Challenge, choose the goal and tick the commitment.</li>
              <li>Choose “Start the challenge”. Day one is today or tomorrow.</li>
            </ol>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={routes.signUp} className="w-full sm:w-auto">Create a free account</ButtonLink>
              <ButtonLink href={routes.signIn} variant="secondary" className="w-full sm:w-auto">Sign in</ButtonLink>
            </div>
          </section>
        </div>
      </div>
    </PublicShell>
  );
}
