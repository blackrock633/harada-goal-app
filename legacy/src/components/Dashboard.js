/* ==========================================================================
   ASCEND COMPONENT: DASHBOARD VIEW
   ========================================================================== */

import { db } from '../utils/db.js';

export const Dashboard = {
  render(container, app) {
    this.container = container;
    this.app = app;

    const activeGoalId = db.getActiveGoalId();
    const goals = db.getGoals();

    if (goals.length === 0) {
      this.renderEmptyState();
      return;
    }

    const activeGoal = goals.find(g => g.id === activeGoalId) || goals[0];
    if (activeGoal && activeGoal.id !== activeGoalId) {
      db.setActiveGoalId(activeGoal.id);
    }

    const categories = db.getCategories(activeGoal.id);
    const habits = db.getHabitsForGoal(activeGoal.id);
    const stats = db.getUserStats();

    // Calculate Completion Statistics
    let avgProgress = 0;
    if (categories.length > 0) {
      const sum = categories.reduce((acc, cat) => acc + (cat.progress_score || 0), 0);
      avgProgress = Math.round(sum / categories.length);
    }

    // Streaks & Completions Today
    const todayStr = new Date().toISOString().split('T')[0];
    const logs = db.getAllLogs();
    
    const todayHabits = habits.filter(h => h.frequency === 'daily');
    const completedToday = todayHabits.filter(h => {
      const log = logs.find(l => l.habit_id === h.id && l.date === todayStr);
      return log && log.completion_value >= h.target_value;
    });

    const activeStreaks = habits.map(h => h.streak || 0);
    const maxStreak = activeStreaks.length > 0 ? Math.max(...activeStreaks) : 0;

    // Calculate level percentage
    const xpPercent = Math.round((stats.xp / stats.next_level_xp) * 100);

    // Get recent activity logs (e.g. completions in the last few days, level ups)
    const recentActivities = this.getRecentActivity(logs, habits, stats);

    const content = `
      <div class="dashboard-layout fade-in">
        <!-- Screen Header -->
        <div class="screen-header">
          <div class="screen-title">
            <h1>SYSTEM OVERVIEW</h1>
            <p>${activeGoal.title} // Target: ${activeGoal.target_date ? new Date(activeGoal.target_date).toLocaleDateString() : 'N/A'}</p>
          </div>
          <button class="btn-primary" id="btn-dash-train">
            <i data-lucide="check-square"></i> Log Actions
          </button>
        </div>

        <!-- Metric Grid -->
        <div class="stat-grid">
          <div class="glass-panel stat-card">
            <div class="stat-icon cyan">
              <i data-lucide="trending-up"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value">${avgProgress}%</div>
              <div class="stat-label">Goal Completion</div>
            </div>
          </div>

          <div class="glass-panel stat-card">
            <div class="stat-icon purple">
              <i data-lucide="award"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value">LVL ${stats.level}</div>
              <div class="stat-label">${stats.rank}</div>
            </div>
          </div>

          <div class="glass-panel stat-card">
            <div class="stat-icon emerald">
              <i data-lucide="calendar"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value">${completedToday.length}/${todayHabits.length}</div>
              <div class="stat-label">Daily Habits Done</div>
            </div>
          </div>

          <div class="glass-panel stat-card">
            <div class="stat-icon amber">
              <i data-lucide="zap"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value">${maxStreak} <span style="font-size: 12px; font-weight: 300;">days</span></div>
              <div class="stat-label">Longest Streak</div>
            </div>
          </div>
        </div>

        <!-- Split Layout panels -->
        <div class="dashboard-panels">
          <!-- Skill progression breakdown -->
          <div class="glass-panel">
            <div class="panel-header">
              <div class="panel-title">
                <i data-lucide="git-branch" style="color: var(--neon-cyan);"></i> Core Skills Progress
              </div>
              <button class="btn-secondary" id="btn-dash-tree-view" style="font-size: 11px; padding: 6px 12px;">Open Skill Tree</button>
            </div>

            <div class="category-progress-list">
              ${categories.length === 0 ? `
                <div class="empty-state">
                  <i data-lucide="alert-circle"></i>
                  <p>No skill categories defined yet. Head to the Goal Tree to add categories!</p>
                </div>
              ` : categories.map(cat => {
                const catHabits = habits.filter(h => h.category_id === cat.id);
                const completedCatHabits = catHabits.filter(h => {
                  const log = logs.find(l => l.habit_id === h.id && l.date === todayStr);
                  return log && log.completion_value >= h.target_value;
                });
                
                return `
                  <div class="category-row">
                    <div class="category-row-header">
                      <div class="category-title-wrap">
                        <div class="category-color-dot" style="background-color: ${cat.color}; box-shadow: 0 0 8px ${cat.color}80;"></div>
                        <span class="category-row-name">${cat.title}</span>
                      </div>
                      <span class="category-row-score" style="color: ${cat.color}">${cat.progress_score || 0}%</span>
                    </div>
                    <div class="category-progress-outer">
                      <div class="category-progress-inner" style="width: ${cat.progress_score || 0}%; background-color: ${cat.color}; box-shadow: 0 0 10px ${cat.color}aa;"></div>
                    </div>
                    <div class="category-meta">
                      <span>${catHabits.length} Actions Tracked</span>
                      <span>Today: ${completedCatHabits.length}/${catHabits.filter(h=>h.frequency==='daily').length} Done</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Recent achievements / Activity timeline -->
          <div class="glass-panel">
            <div class="panel-header">
              <div class="panel-title">
                <i data-lucide="activity" style="color: var(--neon-purple);"></i> Activity Timeline
              </div>
            </div>
            
            <div class="timeline">
              ${recentActivities.length === 0 ? `
                <div class="empty-state" style="padding: 20px 0;">
                  <i data-lucide="check-circle" style="opacity: 0.2;"></i>
                  <p>Your actions will register here as you level up and complete habits.</p>
                </div>
              ` : recentActivities.map(act => `
                <div class="timeline-item">
                  <div class="timeline-icon ${act.type}">
                    <i data-lucide="${act.icon}"></i>
                  </div>
                  <div class="timeline-content">
                    <span class="timeline-title">${act.title}</span>
                    <span class="timeline-time">${act.time}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = content;
    lucide.createIcons();
    this.initListeners();
  },

  renderEmptyState() {
    this.container.innerHTML = `
      <div class="glass-panel onboarding-card fade-in" style="max-width: 600px; margin: 80px auto; text-align: center; display: flex; flex-direction: column; gap: 20px; padding: 40px 30px;">
        <div class="choice-icon" style="width: 60px; height: 60px; font-size: 28px; margin: 0 auto; background: rgba(0, 242, 254, 0.05); border-color: rgba(0, 242, 254, 0.2); color: var(--neon-cyan); box-shadow: var(--glow-shadow-cyan);">▲</div>
        <div class="screen-title">
          <h1 style="font-size: 24px;">NO ACTIVE PROTOCOLS</h1>
          <p style="margin-top: 8px;">To begin leveling up, define your primary target goal. We'll build a skill tree to track your daily progress.</p>
        </div>
        <button class="btn-primary" id="btn-dash-start-onboarding" style="margin: 10px auto 0;">
          Initialize First Goal <i data-lucide="plus"></i>
        </button>
      </div>
    `;
    lucide.createIcons();
    this.container.querySelector('#btn-dash-start-onboarding').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('play-sound', { detail: { type: 'click' } }));
      this.app.navigateTo('onboarding');
    });
  },

  getRecentActivity(logs, habits, stats) {
    const list = [];
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Level Ups
    if (stats.level > 1) {
      list.push({
        type: 'level-up',
        icon: 'chevrons-up',
        title: `Promoted to Level ${stats.level} (${stats.rank})`,
        time: 'Active State',
        dateObj: new Date()
      });
    }

    // 2. Achievements
    if (stats.achievements_unlocked && stats.achievements_unlocked.length > 0) {
      const achMap = {
        first_goal: { title: 'Unlocked: Decide the Path', icon: 'flag' },
        builder: { title: 'Unlocked: Architect (3+ nodes)', icon: 'cpu' },
        first_action: { title: 'Unlocked: First Blood (Logged habit)', icon: 'check-circle' },
        streak_5: { title: 'Unlocked: Dedicated (5-day streak)', icon: 'zap' },
        streak_10: { title: 'Unlocked: Relentless (10-day streak)', icon: 'zap' },
        lvl_5: { title: 'Unlocked: Rising Champion (Lvl 5)', icon: 'shield' }
      };
      
      stats.achievements_unlocked.forEach(achId => {
        if (achMap[achId]) {
          list.push({
            type: 'level-up',
            icon: achMap[achId].icon,
            title: achMap[achId].title,
            time: 'Achievement UNLOCKED',
            dateObj: new Date(Date.now() - 10000) // sort slightly below level
          });
        }
      });
    }

    // 3. Today's logs
    const todayLogs = logs.filter(l => l.date === todayStr);
    todayLogs.forEach(l => {
      const habit = habits.find(h => h.id === l.habit_id);
      if (habit) {
        const isCompleted = l.completion_value >= habit.target_value;
        if (isCompleted) {
          list.push({
            type: 'completed',
            icon: 'check-circle',
            title: `Completed Action: "${habit.title}"`,
            time: `Today // ${l.completion_value} ${habit.unit}`,
            dateObj: new Date()
          });
        }
      }
    });

    // Sort recent list
    return list.slice(0, 5);
  },

  initListeners() {
    const handleSound = () => {
      window.dispatchEvent(new CustomEvent('play-sound', { detail: { type: 'click' } }));
    };

    const trainBtn = this.container.querySelector('#btn-dash-train');
    if (trainBtn) {
      trainBtn.addEventListener('click', () => {
        handleSound();
        this.app.navigateTo('tracker');
      });
    }

    const treeViewBtn = this.container.querySelector('#btn-dash-tree-view');
    if (treeViewBtn) {
      treeViewBtn.addEventListener('click', () => {
        handleSound();
        this.app.navigateTo('tree');
      });
    }
  }
};
export default Dashboard;
