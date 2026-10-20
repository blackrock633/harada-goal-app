'use client';

import React from 'react';
import { notFound } from 'next/navigation';
import { 
  Button, IconButton, Field, Input, Textarea, Select, DateInput,
  CheckCircle, ProgressBar, ProgressRing, DialogRoot, DialogTrigger, DialogContent,
  ConfirmDialog, MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator,
  Badge, useToast, Skeleton, EmptyState, ErrorState
} from '@/ui/primitives';
import { AppShell } from '@/ui/shell/AppShell';
import { Settings, Plus, MoreHorizontal } from 'lucide-react';

export default function StyleguidePage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <AppShell 
      user={{ displayName: 'Sample User' }} 
      signOutAction={async () => {}}
    >
      <div className="p-6 md:p-12 space-y-16 max-w-[720px] mx-auto">
        <header className="space-y-2">
          <h1 className="text-3xl font-serif text-ink font-semibold">Design System</h1>
          <p className="text-ink-muted">A calm, editorial interface. Ink on warm paper.</p>
        </header>

        <section className="space-y-6">
          <h2 className="text-xl font-serif text-ink border-b border-rule pb-2">Typography & Colors</h2>
          <div className="space-y-4">
            <div className="bg-surface p-6 rounded-[var(--radius-md)] border border-rule space-y-4">
              <h1 className="text-4xl font-serif">Display Heading</h1>
              <h2 className="text-2xl font-serif">Section Heading</h2>
              <p className="text-base text-ink leading-relaxed">
                Body text is 16px Inter. This is a paragraph demonstrating the reading measure and line-height.
                The quick brown fox jumps over the lazy dog. 
              </p>
              <p className="text-sm text-ink-muted">Secondary text for hints and meta information.</p>
            </div>
            
            <div className="flex gap-2 flex-wrap">
              <Badge variant="default">Draft</Badge>
              <Badge variant="active">Active</Badge>
              <Badge variant="achieved">Achieved</Badge>
              <Badge variant="ahead">Ahead</Badge>
              <Badge variant="on_track">On track</Badge>
              <Badge variant="behind">Behind</Badge>
              <Badge variant="overdue">Overdue</Badge>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-serif text-ink border-b border-rule pb-2">Buttons & Actions</h2>
          <div className="flex flex-wrap gap-4 items-center">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="primary" loading>Loading</Button>
            <Button variant="primary" size="sm">Small</Button>
            <IconButton label="Settings"><Settings className="w-5 h-5" /></IconButton>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-serif text-ink border-b border-rule pb-2">Inputs & Forms</h2>
          <div className="space-y-4 max-w-sm">
            <Field label="Goal Title" hint="What do you want to achieve?">
              <Input placeholder="e.g. Run a marathon…" />
            </Field>
            
            <Field label="Email" error="Please enter a valid email address">
              <Input type="email" defaultValue="invalid-email" />
            </Field>
            
            <Field label="Vision">
              <Textarea placeholder="What does achieving this look like?…" maxLength={2000} />
            </Field>

            <Field label="Target Date">
              <DateInput />
            </Field>

            <Field label="Category">
              <Select>
                <option>Health</option>
                <option>Career</option>
              </Select>
            </Field>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-serif text-ink border-b border-rule pb-2">Overlays</h2>
          <div className="flex gap-4">
            <DialogRoot>
              <DialogTrigger asChild><Button variant="secondary">Open Dialog</Button></DialogTrigger>
              <DialogContent title="Edit Outcome" description="Make changes to this outcome here. Click save when you're done.">
                <div className="py-4 space-y-4">
                  <Field label="Title"><Input defaultValue="Increase Speed" /></Field>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="ghost">Cancel</Button>
                  <Button variant="primary">Save changes</Button>
                </div>
              </DialogContent>
            </DialogRoot>

            <ConfirmDialog 
              title="Delete Goal" 
              description="This action cannot be undone. This will permanently delete the goal."
              destructive
              requireText="Delete"
              onConfirm={() => {}}
            >
              <Button variant="danger">Delete Goal</Button>
            </ConfirmDialog>

            <MenuRoot>
              <MenuTrigger asChild>
                <Button variant="secondary">Options <MoreHorizontal className="w-4 h-4 ml-2" /></Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem>Edit</MenuItem>
                <MenuItem>Archive</MenuItem>
                <MenuSeparator />
                <MenuItem destructive>Delete</MenuItem>
              </MenuContent>
            </MenuRoot>
            
            <ToastDemo />
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-serif text-ink border-b border-rule pb-2">Progress & Indicators</h2>
          <div className="space-y-6 max-w-sm">
            <ProgressBar progress={0.65} label="Goal Progress" />
            <ProgressBar progress={null} label="New Goal" />
            
            <div className="flex items-center gap-4">
              <ProgressRing progress={0.3} size={48} strokeWidth={4} />
              <ProgressRing progress={1} size={48} strokeWidth={4} />
              <ProgressRing progress={null} size={48} strokeWidth={4} />
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-serif text-ink border-b border-rule pb-2">Signature Views</h2>
          
          <div className="space-y-8">
            {/* Goal Header */}
            <div className="bg-surface p-6 rounded-[var(--radius-md)] border border-rule shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-serif text-ink font-semibold">Make the Varsity Roster</h2>
                  <p className="text-ink-muted text-sm mt-1">Target: Nov 1, 2026</p>
                </div>
                <Badge variant="on_track">On track</Badge>
              </div>
              <ProgressBar progress={0.42} />
            </div>

            {/* Today Row List */}
            <div className="space-y-2">
              <h3 className="font-serif text-lg text-ink">Next up</h3>
              <div className="bg-surface border border-rule rounded-[var(--radius-md)] divide-y divide-rule">
                <div className="flex items-center p-3 gap-3 hover:bg-surface-sunken transition-colors">
                  <CheckCircle label="Complete drills" kind="routine" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">Morning conditioning drills</p>
                    <p className="text-xs text-ink-muted truncate">Fitness · Speed</p>
                  </div>
                </div>
                <div className="flex items-center p-3 gap-3 hover:bg-surface-sunken transition-colors">
                  <CheckCircle label="Watch tape" kind="task" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">Watch opponent film</p>
                    <p className="text-xs text-ink-muted truncate">Strategy · Tactics</p>
                  </div>
                  <Badge variant="overdue">Overdue</Badge>
                </div>
                <div className="flex items-center p-3 gap-3 bg-surface-sunken opacity-60">
                  <CheckCircle label="Stretching" kind="routine" checked />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink line-through truncate">Evening stretching</p>
                    <p className="text-xs text-ink-muted truncate">Fitness · Recovery</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Open Window 64 snippet */}
            <div>
              <h3 className="font-serif text-lg text-ink mb-2">Plan (3×3 snippet)</h3>
              <div className="grid grid-cols-3 gap-1 bg-rule p-1 rounded-[var(--radius-md)] max-w-sm">
                <div className="aspect-square bg-surface rounded-[var(--radius-sm)] p-2 flex flex-col justify-between">
                  <p className="text-xs font-medium text-ink line-clamp-2">Intervals</p>
                  <div className="self-end"><span className="text-xs text-ink-muted">↻</span></div>
                </div>
                <div className="aspect-square bg-accent-soft rounded-[var(--radius-sm)] p-2 flex flex-col items-center justify-center text-center">
                  <p className="text-sm font-serif font-semibold text-ink line-clamp-2">Speed</p>
                </div>
                <div className="aspect-square bg-surface rounded-[var(--radius-sm)] p-2 flex flex-col justify-between">
                  <p className="text-xs font-medium text-ink-muted line-clamp-2 line-through">Buy cleats</p>
                  <div className="self-end"><CheckCircle label="done" checked className="scale-50 origin-bottom-right" /></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-serif text-ink border-b border-rule pb-2">States</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <EmptyState 
              title="No goals yet" 
              description="Create a long-term goal to start your Harada journey."
              action={<Button variant="primary" className="mt-4"><Plus className="w-4 h-4 mr-2"/> New Goal</Button>}
            />
            <ErrorState description="Failed to load your plan. Please check your connection." />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </section>
        
      </div>
    </AppShell>
  );
}

function ToastDemo() {
  const { toast } = useToast();
  return (
    <div className="space-x-2">
      <Button variant="secondary" onClick={() => toast({ title: 'Goal archived', type: 'info', action: { label: 'Undo', onClick: () => {} } })}>
        Info Toast
      </Button>
      <Button variant="secondary" onClick={() => toast({ title: 'Error saving plan', description: 'Please try again.', type: 'error' })}>
        Error Toast
      </Button>
    </div>
  );
}
