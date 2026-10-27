import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import * as q from '@/application/queries';
import { referralFrom } from '@/application/web-public';
import { TEMPLATES } from '@/domain/templates';
import { getDeps } from '@/infrastructure/container';
import { fetchPricingCatalog } from '@/infrastructure/supabase/public-data';
import { anonSupabase } from '@/infrastructure/supabase/server';
import { getCtx } from '@/app/lib/session';
import { trackBrowserEventAction } from '@/app/actions/billing';
import { PlanSheet, type PlanSheetData } from '@/ui/features/matrix/PlanSheet';
import { PricingPlans, PublicShell, TrackView } from '@/ui/features/marketing';
import { ButtonLink } from '@/ui/primitives';
import { routes } from '@/ui/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: 'Harada — Turn ambition into execution' },
  description:
    'Break your biggest goal into a clear plan, take meaningful action every day, and build a system for measuring your progress.',
};

/** The marathon starter template, exactly as the app ships it, as a sheet. */
function exampleSheet(): PlanSheetData {
  const t = TEMPLATES.find((x) => x.id === 'marathon') ?? TEMPLATES[0]!;
  return {
    goalTitle: t.goalTitle,
    areas: t.outcomes.map((o) => ({ title: o.title, actions: o.actions.map((a) => ({ title: a.title, kind: a.kind })) })),
  };
}

const STEPS = [
  {
    title: 'Name one goal',
    body: 'Write the goal at the centre of the sheet, with a target date and why it matters to you and to others.',
  },
  {
    title: 'Choose 8 key areas',
    body: 'Around the goal, name the eight things that have to be true for it to happen: skills, health, habits, relationships.',
  },
  {
    title: 'Plan 64 actions',
    body: 'Give each key area up to eight concrete actions — one-time tasks or repeating routines. You can start with a few.',
  },
  {
    title: 'Act daily, review weekly',
    body: 'Today shows what is due. Check things off as you do them, then look back each week and adjust the plan.',
  },
];

const USE_CASES = [
  {
    who: 'Students',
    body: 'Turn “get better grades” into study routines, office hours and a weekly look at what actually happened.',
  },
  {
    who: 'Founders',
    body: 'Keep product, customers, money and your own energy on one page, so the urgent doesn’t crowd out the important.',
  },
  {
    who: 'Athletes',
    body: 'Training, recovery, nutrition and mindset as routines you can check off — the structure the method is known for in sport.',
  },
  {
    who: 'Skill-builders',
    body: 'Learning an instrument, a language or a craft: break practice into areas and keep an honest record of the work.',
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let signedInTarget: string | null = null;
  try {
    const ctx = await getCtx();
    if (ctx) {
      const today = await q.getToday(await getDeps(), ctx);
      signedInTarget = today.ok && !today.data.hasAnyGoals ? routes.goalNew : routes.today;
    }
  } catch {
    // Session or database unavailable: show the public page.
  }
  // Signed-in users go straight to the app (outside the try: redirect() throws by design).
  if (signedInTarget) redirect(signedInTarget);

  const params = await searchParams;
  const ref = referralFrom(params.ref);
  const startHref = routes.signUpWith({ ref });
  const catalog = await fetchPricingCatalog(anonSupabase());

  return (
    <PublicShell>
      <TrackView name="landing_page_viewed" track={trackBrowserEventAction} />

      {/* Hero */}
      <section className="mx-auto w-full max-w-[1120px] px-4 pb-12 pt-12 md:px-8 md:pt-20">
        <h1 className="max-w-[18ch] font-serif text-4xl font-medium leading-[1.1] tracking-tight text-ink md:text-6xl">
          Turn ambition into execution.
        </h1>
        <p className="mt-5 max-w-[60ch] text-lg text-ink-muted md:text-xl">
          Break your biggest goal into a clear plan, take meaningful action every day, and build a system for measuring
          your progress.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={startHref} className="w-full sm:w-auto">Start your first goal</ButtonLink>
          <ButtonLink href="#how-it-works" variant="secondary" className="w-full sm:w-auto">See how it works</ButtonLink>
        </div>
        <p className="mt-3 text-sm text-ink-muted">Free to start. No card needed.</p>
      </section>

      {/* Product demonstration */}
      <section aria-labelledby="sheet-heading" className="border-t border-rule bg-surface-sunken/60">
        <div className="mx-auto w-full max-w-[1120px] px-4 py-12 md:px-8">
          <h2 id="sheet-heading" className="font-serif text-2xl text-ink md:text-3xl">One goal. Eight areas. Sixty-four actions.</h2>
          <p className="mt-3 max-w-[64ch] text-ink-muted">
            This is the marathon starter template as Harada lays it out: the goal in the centre, key areas around it,
            and each key area at the centre of its own block of eight actions. ○ marks a one-time task, ↻ a routine.
          </p>
          <PlanSheet data={exampleSheet()} className="mt-8" />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-heading" className="mx-auto w-full max-w-[1120px] scroll-mt-4 px-4 py-12 md:px-8">
        <h2 id="how-heading" className="font-serif text-2xl text-ink md:text-3xl">How it works</h2>
        <ol className="mt-8 grid min-w-0 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="min-w-0 border-t border-rule pt-4">
              <p className="text-sm font-medium text-accent">Step {i + 1}</p>
              <h3 className="mt-1 font-serif text-xl text-ink">{s.title}</h3>
              <p className="mt-2 text-ink-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Use cases */}
      <section aria-labelledby="who-heading" className="border-t border-rule">
        <div className="mx-auto w-full max-w-[1120px] px-4 py-12 md:px-8">
          <h2 id="who-heading" className="font-serif text-2xl text-ink md:text-3xl">Who it’s for</h2>
          <p className="mt-3 max-w-[64ch] text-ink-muted">
            Anyone with one goal that matters and takes months, not days. A plan won’t do the work for you; it makes the
            work visible.
          </p>
          <ul className="mt-8 grid min-w-0 gap-6 sm:grid-cols-2">
            {USE_CASES.map((u) => (
              <li key={u.who} className="min-w-0">
                <h3 className="font-serif text-lg text-ink">{u.who}</h3>
                <p className="mt-1 text-ink-muted">{u.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Why not a to-do list */}
      <section aria-labelledby="todo-heading" className="border-t border-rule">
        <div className="mx-auto w-full max-w-[720px] px-4 py-12 md:px-8">
          <h2 id="todo-heading" className="font-serif text-2xl text-ink md:text-3xl">Why not just a to-do list?</h2>
          <div className="mt-4 space-y-4 text-ink-muted">
            <p>
              A to-do list holds whatever is loudest today. It doesn’t say why a task matters, which part of your goal it
              serves, or which part you’ve been neglecting.
            </p>
            <p>
              A Harada sheet starts from the goal. Every action belongs to a key area, routines sit next to one-time
              tasks, and an empty area is visible at a glance. Finishing tasks is tracked separately from reaching the
              goal — checking boxes is progress, not proof you’re done.
            </p>
          </div>
        </div>
      </section>

      {/* About the method (no testimonials exist; none are invented) */}
      <section aria-labelledby="method-heading" className="border-t border-rule bg-surface-sunken/60">
        <div className="mx-auto w-full max-w-[720px] px-4 py-12 md:px-8">
          <h2 id="method-heading" className="font-serif text-2xl text-ink md:text-3xl">About the Harada method</h2>
          <div className="mt-4 space-y-4 text-ink-muted">
            <p>
              The Harada method is a goal-setting approach associated with Japanese coach Takashi Harada, described in
              English in Norman Bodek’s book <cite>The Harada Method: The Spirit of Self-Reliance</cite>. Its best-known
              tool is a 9×9 chart — often called the Open Window 64 — with one central goal, eight supporting elements
              and eight actions for each.
            </p>
            <p>
              The chart became widely known after reports that baseball player Shohei Ohtani filled one in as a high
              school student. Harada (this app) is an independent product built around that structure; schedules,
              templates and weekly reviews are our additions, not part of the original method.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section aria-labelledby="pricing-heading" className="mx-auto w-full max-w-[1120px] px-4 py-12 md:px-8">
        <h2 id="pricing-heading" className="font-serif text-2xl text-ink md:text-3xl">Pricing</h2>
        <p className="mt-3 max-w-[64ch] text-ink-muted">Start free with one active goal. Upgrade only if you want more.</p>
        <div className="mt-8">
          <PricingPlans
            catalog={catalog}
            freeAction={<ButtonLink href={startHref} variant="secondary" className="w-full sm:w-auto">Start free</ButtonLink>}
          />
        </div>
        <p className="mt-4 text-sm">
          <Link href={routes.pricing} className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2">
            Full plan comparison and billing terms
          </Link>
        </p>
      </section>

      {/* Final CTA */}
      <section aria-labelledby="cta-heading" className="border-t border-rule">
        <div className="mx-auto w-full max-w-[720px] px-4 py-16 text-center md:px-8">
          <h2 id="cta-heading" className="font-serif text-2xl text-ink md:text-3xl">Start with one goal.</h2>
          <p className="mx-auto mt-3 max-w-[52ch] text-ink-muted">
            You don’t need all 64 actions to begin. Write the goal, add a few actions, and take the first one today.
          </p>
          <div className="mt-6 flex justify-center">
            <ButtonLink href={startHref} className="w-full sm:w-auto">Start your first goal</ButtonLink>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
