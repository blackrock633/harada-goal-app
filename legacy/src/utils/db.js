/* ==========================================================================
   ASCEND DATABASE SERVICE (localStorage wrapper)
   ========================================================================== */

const STORAGE_KEYS = {
  GOALS: 'ascend_goals',
  CATEGORIES: 'ascend_categories',
  HABITS: 'ascend_habits',
  LOGS: 'ascend_logs',
  USER_STATS: 'ascend_user_stats',
  SOUND_ENABLED: 'ascend_sound_enabled',
  ACTIVE_GOAL_ID: 'ascend_active_goal_id'
};

// RPG Rank Titles based on user level
const RANKS = [
  { maxLevel: 2, title: 'Initiate' },
  { maxLevel: 5, title: 'Apprentice' },
  { maxLevel: 10, title: 'Contender' },
  { maxLevel: 15, title: 'Challenger' },
  { maxLevel: 20, title: 'Elite athlete' },
  { maxLevel: 30, title: 'Master' },
  { maxLevel: Infinity, title: 'Grandmaster' }
];

// Sound Effects Trigger Event
const dispatchSoundEvent = (soundType) => {
  window.dispatchEvent(new CustomEvent('play-sound', { detail: { type: soundType } }));
};

// Toast message Dispatcher
export const triggerToast = (message, type = 'info') => {
  window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, type } }));
};

// Initial template data for ultimate frisbee goal mapping
const ULTIMATE_FRISBEE_TEMPLATE = {
  goal: {
    title: 'Become an Elite Ultimate Frisbee Player',
    description: 'Prepare to make the premier club/college roster (e.g. Mamabird) by training throwing mechanics, conditioning, and IQ.',
    target_date: '2026-11-15'
  },
  categories: [
    { title: 'Throwing Mechanics', color: '#00f2fe' }, // Cyan
    { title: 'Athleticism & Speed', color: '#9d4edd' }, // Purple
    { title: 'Game IQ & Film Study', color: '#00f5a0' }, // Emerald
    { title: 'Mental & Defense', color: '#ff9f1c' } // Amber
  ],
  habits: [
    // Category 0: Throwing Mechanics
    { catIndex: 0, title: '200 Kung Fu Throws', frequency: 'daily', metric_type: 'number', target_value: 200, unit: 'throws' },
    { catIndex: 0, title: 'Daily pivot marking drills', frequency: 'daily', metric_type: 'binary', target_value: 1, unit: 'sessions' },
    
    // Category 1: Athleticism & Speed
    { catIndex: 1, title: 'Sprint workout (40yd repeats)', frequency: 'weekly', metric_type: 'binary', target_value: 2, unit: 'workouts' },
    { catIndex: 1, title: 'Core strength routine', frequency: 'daily', metric_type: 'binary', target_value: 1, unit: 'sessions' },
    
    // Category 2: Game IQ
    { catIndex: 2, title: 'Watch elite game film', frequency: 'daily', metric_type: 'number', target_value: 20, unit: 'mins' },
    { catIndex: 2, title: 'Review playbook rules', frequency: 'weekly', metric_type: 'binary', target_value: 1, unit: 'sessions' },
    
    // Category 3: Mental & Defense
    { catIndex: 3, title: 'Mindfulness / Visualization', frequency: 'daily', metric_type: 'number', target_value: 10, unit: 'mins' },
    { catIndex: 3, title: 'Footwork agility ladder', frequency: 'weekly', metric_type: 'binary', target_value: 3, unit: 'workouts' }
  ]
};

// Starter database helper functions
export const db = {
  // Initialize storage
  init() {
    if (!localStorage.getItem(STORAGE_KEYS.GOALS)) {
      localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CATEGORIES)) {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.HABITS)) {
      localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.LOGS)) {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.USER_STATS)) {
      localStorage.setItem(STORAGE_KEYS.USER_STATS, JSON.stringify({
        level: 1,
        xp: 0,
        next_level_xp: 100,
        rank: 'Initiate',
        total_xp_earned: 0,
        achievements_unlocked: []
      }));
    }
    if (localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) === null) {
      localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, 'true');
    }
  },

  // RESET DATABASE completely (wipes local storage and restarts)
  clearAll() {
    localStorage.clear();
    this.init();
  },

  // Import full backup JSON
  importData(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      if (data.goals && data.categories && data.habits && data.logs && data.userStats) {
        localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(data.goals));
        localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(data.categories));
        localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(data.habits));
        localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(data.logs));
        localStorage.setItem(STORAGE_KEYS.USER_STATS, JSON.stringify(data.userStats));
        if (data.activeGoalId) {
          localStorage.setItem(STORAGE_KEYS.ACTIVE_GOAL_ID, data.activeGoalId);
        }
        triggerToast('Database restored successfully!', 'success');
        return true;
      }
      throw new Error('Invalid backup file format');
    } catch (err) {
      triggerToast('Restore failed: ' + err.message, 'error');
      return false;
    }
  },

  // Export full backup JSON
  exportData() {
    const backup = {
      goals: this.getGoals(),
      categories: this.getAllCategories(),
      habits: this.getAllHabits(),
      logs: this.getAllLogs(),
      userStats: this.getUserStats(),
      activeGoalId: this.getActiveGoalId()
    };
    return JSON.stringify(backup, null, 2);
  },

  // SOUND CONTROLS
  isSoundEnabled() {
    return localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) === 'true';
  },
  setSoundEnabled(enabled) {
    localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, enabled ? 'true' : 'false');
  },

  // ACTIVE GOAL SELECTION
  getActiveGoalId() {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_GOAL_ID) || null;
  },
  setActiveGoalId(id) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_GOAL_ID, id);
    window.dispatchEvent(new CustomEvent('active-goal-changed', { detail: { goalId: id } }));
  },

  /* --- GOALS --- */
  getGoals() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.GOALS)) || [];
  },
  addGoal(title, description, target_date) {
    const goals = this.getGoals();
    const newGoal = {
      id: 'g_' + Math.random().toString(36).substr(2, 9),
      title,
      description,
      target_date: target_date || null,
      created_at: new Date().toISOString()
    };
    goals.push(newGoal);
    localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(goals));
    if (goals.length === 1) {
      this.setActiveGoalId(newGoal.id);
    }
    return newGoal;
  },
  deleteGoal(goalId) {
    let goals = this.getGoals();
    goals = goals.filter(g => g.id !== goalId);
    localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(goals));

    // Cleanup connected categories, habits, logs
    const categories = this.getCategories(goalId);
    categories.forEach(c => this.deleteCategory(c.id));

    // Reset active goal if deleted
    if (this.getActiveGoalId() === goalId) {
      const nextGoal = this.getGoals()[0];
      this.setActiveGoalId(nextGoal ? nextGoal.id : null);
    }
  },

  /* --- CATEGORIES --- */
  getAllCategories() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CATEGORIES)) || [];
  },
  getCategories(goalId) {
    const all = this.getAllCategories();
    return all.filter(c => c.goal_id === goalId);
  },
  addCategory(goalId, title, color = '#9d4edd') {
    const all = this.getAllCategories();
    const newCat = {
      id: 'c_' + Math.random().toString(36).substr(2, 9),
      goal_id: goalId,
      title,
      color,
      progress_score: 0
    };
    all.push(newCat);
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(all));
    return newCat;
  },
  deleteCategory(catId) {
    let all = this.getAllCategories();
    all = all.filter(c => c.id !== catId);
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(all));

    // Cleanup habits in category
    const habits = this.getHabits(catId);
    habits.forEach(h => this.deleteHabit(h.id));
  },

  /* --- HABITS & SUBGOALS --- */
  getAllHabits() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.HABITS)) || [];
  },
  getHabits(catId) {
    const all = this.getAllHabits();
    return all.filter(h => h.category_id === catId);
  },
  getHabitsForGoal(goalId) {
    const categories = this.getCategories(goalId);
    const catIds = categories.map(c => c.id);
    const allHabits = this.getAllHabits();
    return allHabits.filter(h => catIds.includes(h.category_id));
  },
  addHabit(catId, title, frequency = 'daily', metric_type = 'binary', target_value = 1, unit = 'reps') {
    const all = this.getAllHabits();
    const newHabit = {
      id: 'h_' + Math.random().toString(36).substr(2, 9),
      category_id: catId,
      title,
      frequency, // 'daily' | 'weekly'
      metric_type, // 'binary' | 'number'
      target_value: Number(target_value),
      unit: unit || 'reps',
      streak: 0,
      max_streak: 0,
      last_logged_date: null
    };
    all.push(newHabit);
    localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(all));
    return newHabit;
  },
  deleteHabit(habitId) {
    let all = this.getAllHabits();
    all = all.filter(h => h.id !== habitId);
    localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(all));

    // Cleanup logs for this habit
    let logs = this.getAllLogs();
    logs = logs.filter(l => l.habit_id !== habitId);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
  },

  /* --- HABIT LOGS (Daily Completions) --- */
  getAllLogs() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS)) || [];
  },
  getLogsForHabit(habitId) {
    const all = this.getAllLogs();
    return all.filter(l => l.habit_id === habitId);
  },
  logHabit(habitId, dateStr, completionValue) {
    const logs = this.getAllLogs();
    const existingLogIndex = logs.findIndex(l => l.habit_id === habitId && l.date === dateStr);
    const habits = this.getAllHabits();
    const habitIndex = habits.findIndex(h => h.id === habitId);

    if (habitIndex === -1) return null;
    const habit = habits[habitIndex];
    const targetValue = habit.target_value;
    const isCompletedNow = Number(completionValue) >= targetValue;

    let wasAlreadyCompleted = false;
    let newLog;

    if (existingLogIndex !== -1) {
      wasAlreadyCompleted = logs[existingLogIndex].completion_value >= targetValue;
      logs[existingLogIndex].completion_value = Number(completionValue);
      newLog = logs[existingLogIndex];
    } else {
      newLog = {
        id: 'l_' + Math.random().toString(36).substr(2, 9),
        habit_id: habitId,
        date: dateStr,
        completion_value: Number(completionValue)
      };
      logs.push(newLog);
    }

    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));

    // Update Streak and Award XP if completed
    if (isCompletedNow && !wasAlreadyCompleted) {
      // Manage streaks
      this.updateStreakOnCompletion(habit, dateStr);
      habits[habitIndex] = habit;
      localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(habits));

      // Calculate XP
      const baseXP = habit.metric_type === 'binary' ? 10 : 15;
      const streakBonus = habit.streak >= 5 ? Math.min(25, Math.floor(habit.streak / 5) * 5) : 0;
      const totalXP = baseXP + streakBonus;

      this.addXP(totalXP);
      dispatchSoundEvent('complete');
      
      const streakMsg = streakBonus > 0 ? ` +${streakBonus} XP Streak Bonus!` : '';
      triggerToast(`Habit completed! +${totalXP} XP${streakMsg}`, 'success');
    } else if (!isCompletedNow && wasAlreadyCompleted) {
      // Reverted a completed habit - reduce XP and decrease streak
      this.addXP(-10);
      habit.streak = Math.max(0, habit.streak - 1);
      habits[habitIndex] = habit;
      localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(habits));
      triggerToast('Log updated. -10 XP', 'info');
    }

    // Refresh category progress scores
    this.recalculateCategoryProgress(habit.category_id);

    return newLog;
  },

  updateStreakOnCompletion(habit, dateStr) {
    const today = new Date(dateStr);
    if (habit.last_logged_date) {
      const lastLogged = new Date(habit.last_logged_date);
      const diffTime = Math.abs(today - lastLogged);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        habit.streak += 1;
      } else if (diffDays > 1) {
        habit.streak = 1; // reset streak but count today
      }
    } else {
      habit.streak = 1;
    }
    
    if (habit.streak > habit.max_streak) {
      habit.max_streak = habit.streak;
    }
    habit.last_logged_date = dateStr;
  },

  recalculateCategoryProgress(catId) {
    const habits = this.getHabits(catId);
    if (habits.length === 0) return;

    const logs = this.getAllLogs();
    
    // We compute average progress of habits in this category over the last 7 days
    const last7Days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
    }

    let totalProgress = 0;

    habits.forEach(h => {
      let completedDays = 0;
      if (h.frequency === 'daily') {
        // how many of the last 7 days did we complete?
        last7Days.forEach(date => {
          const log = logs.find(l => l.habit_id === h.id && l.date === date);
          if (log && log.completion_value >= h.target_value) {
            completedDays++;
          }
        });
        totalProgress += (completedDays / 7) * 100;
      } else {
        // weekly check-off
        const logThisWeek = logs.some(l => {
          if (l.habit_id !== h.id) return false;
          const logDate = new Date(l.date);
          const diff = Math.abs(new Date() - logDate);
          return (diff / (1000 * 60 * 60 * 24)) <= 7 && l.completion_value >= h.target_value;
        });
        totalProgress += logThisWeek ? 100 : 0;
      }
    });

    const averageProgress = Math.round(totalProgress / habits.length);

    // Update category
    const categories = this.getAllCategories();
    const catIndex = categories.findIndex(c => c.id === catId);
    if (catIndex !== -1) {
      categories[catIndex].progress_score = averageProgress;
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    }
  },

  /* --- USER STATS & LEVEL ENGINE --- */
  getUserStats() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_STATS)) || {
      level: 1,
      xp: 0,
      next_level_xp: 100,
      rank: 'Initiate',
      total_xp_earned: 0,
      achievements_unlocked: []
    };
  },

  addXP(amount) {
    const stats = this.getUserStats();
    stats.xp += amount;
    stats.total_xp_earned = Math.max(0, stats.total_xp_earned + amount);

    if (stats.xp < 0) {
      stats.xp = 0;
    }

    let leveledUp = false;
    // Level up calculation: XP req = level * 100
    while (stats.xp >= stats.next_level_xp) {
      stats.xp -= stats.next_level_xp;
      stats.level += 1;
      stats.next_level_xp = stats.level * 100;
      leveledUp = true;
    }

    if (leveledUp) {
      // Find matching rank
      const matchingRank = RANKS.find(r => stats.level <= r.maxLevel) || RANKS[RANKS.length - 1];
      stats.rank = matchingRank.title;
      
      // Emit level up event & sound
      dispatchSoundEvent('levelup');
      triggerToast(`LEVEL UP! You reached Level ${stats.level}!`, 'level-up');
    }

    localStorage.setItem(STORAGE_KEYS.USER_STATS, JSON.stringify(stats));
    
    // Refresh Sidebar profile UI
    window.dispatchEvent(new CustomEvent('stats-updated', { detail: stats }));
  },

  // Check achievements dynamically
  checkAchievements() {
    // Basic achievement checks
    const stats = this.getUserStats();
    const goals = this.getGoals();
    const habits = this.getAllHabits();
    const logs = this.getAllLogs();
    
    const achievements = stats.achievements_unlocked || [];
    let updated = false;

    const checkAndAward = (id, title, description) => {
      if (!achievements.includes(id)) {
        achievements.push(id);
        stats.achievements_unlocked = achievements;
        updated = true;
        this.addXP(50); // Achievement bonus XP!
        dispatchSoundEvent('achievement');
        triggerToast(`ACHIEVEMENT UNLOCKED: ${title} (${description})`, 'success');
      }
    };

    if (goals.length >= 1) checkAndAward('first_goal', 'Decide the Path', 'Created your first central goal');
    if (habits.length >= 3) checkAndAward('builder', 'Architect', 'Created 3 or more skill tree nodes');
    if (logs.length >= 1) checkAndAward('first_action', 'First Blood', 'Logged your first action');
    
    const maxStreak = Math.max(0, ...habits.map(h => h.streak));
    if (maxStreak >= 5) checkAndAward('streak_5', 'Dedicated', 'Maintained a 5-day habit streak');
    if (maxStreak >= 10) checkAndAward('streak_10', 'Relentless', 'Maintained a 10-day habit streak');

    if (stats.level >= 5) checkAndAward('lvl_5', 'Rising Champion', 'Reached level 5');

    if (updated) {
      localStorage.setItem(STORAGE_KEYS.USER_STATS, JSON.stringify(stats));
    }
  },

  // Generate template for ultimate frisbee or startup
  // Generate template for ultimate frisbee, startup, soccer, marathon, or gpa
  loadTemplate(type) {
    this.clearAll();
    
    let template = ULTIMATE_FRISBEE_TEMPLATE;
    if (type === 'startup') {
      template = {
        goal: {
          title: 'Launch SaaS Startup MVP',
          description: 'Build, validate, and launch a web application to 100 beta signups in 6 months.',
          target_date: '2026-12-01'
        },
        categories: [
          { title: 'Tech & Code', color: '#00f2fe' },
          { title: 'Customer Discovery', color: '#9d4edd' },
          { title: 'Marketing & SEO', color: '#00f5a0' },
          { title: 'Operations & Legal', color: '#ff9f1c' }
        ],
        habits: [
          { catIndex: 0, title: 'Write production code', frequency: 'daily', metric_type: 'number', target_value: 60, unit: 'mins' },
          { catIndex: 0, title: 'Push git commits', frequency: 'daily', metric_type: 'binary', target_value: 1, unit: 'commits' },
          { catIndex: 1, title: 'Interview 2 potential users', frequency: 'weekly', metric_type: 'number', target_value: 2, unit: 'users' },
          { catIndex: 1, title: 'Review feedback/analytics', frequency: 'weekly', metric_type: 'binary', target_value: 1, unit: 'sessions' },
          { catIndex: 2, title: 'Write 1 technical blog post', frequency: 'weekly', metric_type: 'binary', target_value: 1, unit: 'posts' },
          { catIndex: 2, title: 'Post updates on Twitter/LinkedIn', frequency: 'daily', metric_type: 'binary', target_value: 1, unit: 'posts' },
          { catIndex: 3, title: 'Work on financial models', frequency: 'weekly', metric_type: 'binary', target_value: 1, unit: 'sessions' }
        ]
      };
    } else if (type === 'soccer') {
      template = {
        goal: {
          title: 'Make the Varsity Soccer Roster',
          description: 'Develop ball control, tactile game IQ, and explosive stamina to earn a roster spot.',
          target_date: '2026-09-01'
        },
        categories: [
          { title: 'Ball Mastery', color: '#00f2fe' },
          { title: 'Conditioning', color: '#9d4edd' },
          { title: 'Tactics & Film', color: '#00f5a0' },
          { title: 'Strength & Core', color: '#ff9f1c' }
        ],
        habits: [
          { catIndex: 0, title: 'Juggling & footwork drill', frequency: 'daily', metric_type: 'number', target_value: 30, unit: 'mins' },
          { catIndex: 0, title: 'Wall-passing accuracy drills', frequency: 'daily', metric_type: 'number', target_value: 15, unit: 'mins' },
          { catIndex: 1, title: 'HIIT sprint intervals', frequency: 'weekly', metric_type: 'binary', target_value: 3, unit: 'runs' },
          { catIndex: 1, title: 'Steady state running (3 miles)', frequency: 'weekly', metric_type: 'binary', target_value: 2, unit: 'runs' },
          { catIndex: 2, title: 'Watch tactical games / breakdowns', frequency: 'daily', metric_type: 'number', target_value: 20, unit: 'mins' },
          { catIndex: 3, title: 'Core stability routine', frequency: 'daily', metric_type: 'binary', target_value: 1, unit: 'sessions' },
          { catIndex: 3, title: 'Leg strengthening (weights/body)', frequency: 'weekly', metric_type: 'binary', target_value: 3, unit: 'sessions' }
        ]
      };
    } else if (type === 'marathon') {
      template = {
        goal: {
          title: 'Run a Sub-4 Hour Marathon',
          description: 'Develop physical cardiovascular capacity, lower-body resilience, and race pacing strategy.',
          target_date: '2026-10-15'
        },
        categories: [
          { title: 'Aerobic Endurance', color: '#00f2fe' },
          { title: 'Strength & Core', color: '#9d4edd' },
          { title: 'Pacing & Tempo', color: '#00f5a0' },
          { title: 'Nutrition & Recovery', color: '#ff9f1c' }
        ],
        habits: [
          { catIndex: 0, title: 'Long endurance run', frequency: 'weekly', metric_type: 'binary', target_value: 1, unit: 'runs' },
          { catIndex: 0, title: 'Zone 2 base runs', frequency: 'weekly', metric_type: 'number', target_value: 3, unit: 'sessions' },
          { catIndex: 1, title: 'Leg resistance workout', frequency: 'weekly', metric_type: 'binary', target_value: 2, unit: 'sessions' },
          { catIndex: 1, title: 'Post-run active stretch', frequency: 'daily', metric_type: 'binary', target_value: 1, unit: 'stretches' },
          { catIndex: 2, title: 'Interval / speedwork session', frequency: 'weekly', metric_type: 'binary', target_value: 1, unit: 'runs' },
          { catIndex: 3, title: 'Track daily hydration levels', frequency: 'daily', metric_type: 'number', target_value: 3, unit: 'litres' },
          { catIndex: 3, title: 'Night sleep recovery time', frequency: 'daily', metric_type: 'number', target_value: 8, unit: 'hours' }
        ]
      };
    } else if (type === 'gpa') {
      template = {
        goal: {
          title: 'Achieve a 4.0 Academic GPA',
          description: 'Establish disciplined study systems, review classroom materials, and optimize test preparation.',
          target_date: '2026-06-20'
        },
        categories: [
          { title: 'Focus Study Blocks', color: '#00f2fe' },
          { title: 'Material Review', color: '#9d4edd' },
          { title: 'Exam Prep & Tasks', color: '#00f5a0' },
          { title: 'Classroom Presence', color: '#ff3366' }
        ],
        habits: [
          { catIndex: 0, title: 'Deep focus Pomodoro sessions', frequency: 'daily', metric_type: 'number', target_value: 4, unit: 'pomodoros' },
          { catIndex: 0, title: 'Maintain distraction-free workspace', frequency: 'daily', metric_type: 'binary', target_value: 1, unit: 'sessions' },
          { catIndex: 1, title: 'Active recall flashcards', frequency: 'daily', metric_type: 'number', target_value: 20, unit: 'cards' },
          { catIndex: 1, title: 'Write weekly summary review sheets', frequency: 'weekly', metric_type: 'binary', target_value: 1, unit: 'sheets' },
          { catIndex: 2, title: 'Solve practice exam problems', frequency: 'weekly', metric_type: 'number', target_value: 15, unit: 'problems' },
          { catIndex: 2, title: 'Start assignments 5 days early', frequency: 'weekly', metric_type: 'binary', target_value: 1, unit: 'tasks' },
          { catIndex: 3, title: 'Pre-read upcoming lecture slides', frequency: 'daily', metric_type: 'binary', target_value: 1, unit: 'sessions' },
          { catIndex: 3, title: 'Contribute discussion questions', frequency: 'daily', metric_type: 'number', target_value: 2, unit: 'questions' }
        ]
      };
    }
 
     // Add goal
     const newGoal = this.addGoal(template.goal.title, template.goal.description, template.goal.target_date);
     
     // Add categories
     const createdCats = [];
     template.categories.forEach(c => {
       const cat = this.addCategory(newGoal.id, c.title, c.color);
       createdCats.push(cat);
     });
 
     // Add habits
     template.habits.forEach(h => {
       const catId = createdCats[h.catIndex].id;
       this.addHabit(catId, h.title, h.frequency, h.metric_type, h.target_value, h.unit);
     });
 
     this.setActiveGoalId(newGoal.id);
     triggerToast('Template loaded! Your skill tree has been generated.', 'success');
   }
};
export default db;
