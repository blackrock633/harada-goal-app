/* ==========================================================================
   ASCEND COMPONENT: DAILY ACTIONS TRACKER & LOGGING PANEL
   ========================================================================== */

import { db, triggerToast } from '../utils/db.js';

export const DailyTracker = {
  render(container, app) {
    this.container = container;
    this.app = app;

    const activeGoalId = db.getActiveGoalId();
    if (!activeGoalId) {
      this.container.innerHTML = `
        <div class="glass-panel" style="max-width: 500px; margin: 80px auto; text-align: center;">
          <p>Please create a goal on the Dashboard first.</p>
        </div>
      `;
      return;
    }

    const goals = db.getGoals();
    const activeGoal = goals.find(g => g.id === activeGoalId);
    const categories = db.getCategories(activeGoalId);
    const habits = db.getHabitsForGoal(activeGoalId);
    
    // Group habits by category
    const catMap = {};
    categories.forEach(c => {
      catMap[c.id] = {
        category: c,
        habits: []
      };
    });

    // Handle orphan habits (if any) or only populate valid ones
    habits.forEach(h => {
      if (catMap[h.category_id]) {
        catMap[h.category_id].habits.push(h);
      }
    });

    // Date calculations
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateFormatted = today.toLocaleDateString('en-US', options);

    // Calculate daily completion rate
    const dailyHabits = habits.filter(h => h.frequency === 'daily');
    const logs = db.getAllLogs();
    
    const completedToday = dailyHabits.filter(h => {
      const log = logs.find(l => l.habit_id === h.id && l.date === todayStr);
      return log && log.completion_value >= h.target_value;
    });

    const completionPercent = dailyHabits.length > 0 
      ? Math.round((completedToday.length / dailyHabits.length) * 100) 
      : 0;

    let content = `
      <div class="tracker-layout fade-in">
        <!-- Screen Header -->
        <div class="screen-header">
          <div class="screen-title">
            <h1>DAILY TRAINING PROTOCOL</h1>
            <p>Log actions connected to: ${activeGoal.title}</p>
          </div>
        </div>

        <!-- Date and overall day completion card -->
        <div class="tracker-date-bar glass-panel">
          <div class="date-display">
            <span class="date-text">${dateFormatted}</span>
            <span class="day-progress-label">Today's Protocol: ${completedToday.length} of ${dailyHabits.length} daily actions logged</span>
          </div>
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="font-family: var(--font-display); font-size: 20px; font-weight: 700; color: var(--neon-emerald);">${completionPercent}%</div>
            <div class="xp-bar-container" style="width: 120px; height: 10px; margin-bottom: 0;">
              <div class="xp-bar-fill" style="width: ${completionPercent}%; background: var(--neon-emerald); box-shadow: var(--glow-shadow-emerald);"></div>
            </div>
          </div>
        </div>

        <!-- Habits List Categorized -->
        <div class="habit-list-container">
          ${categories.length === 0 ? `
            <div class="glass-panel empty-state">
              <i data-lucide="plus-circle"></i>
              <p>No actions defined yet. Open the Goal Tree View, click on a skill node, and add your daily habits/subgoals.</p>
              <button class="btn-primary" id="btn-tracker-go-tree" style="margin-top: 10px;">Configure Tree</button>
            </div>
          ` : categories.map(cat => {
            const catInfo = catMap[cat.id];
            const catHabits = catInfo.habits;
            if (catHabits.length === 0) return ''; // Skip empty categories on dashboard to save space

            return `
              <div class="habit-card-group">
                <div class="category-group-header" style="color: ${cat.color}">${cat.title}</div>
                ${catHabits.map(h => {
                  const log = logs.find(l => l.habit_id === h.id && l.date === todayStr);
                  const logVal = log ? log.completion_value : 0;
                  const isCompleted = logVal >= h.target_value;

                  return `
                    <div class="habit-card ${isCompleted ? 'completed' : ''}" 
                         style="border-left: 4px solid ${cat.color}; ${isCompleted ? `box-shadow: inset 0 0 10px ${cat.color}05, 0 2px 10px rgba(0,0,0,0.15);` : ''}">
                      <div class="habit-info-block">
                        <!-- Custom checkbox -->
                        ${h.metric_type === 'binary' ? `
                          <label class="custom-checkbox-wrapper">
                            <input type="checkbox" class="habit-check-input" data-habit-id="${h.id}" ${isCompleted ? 'checked' : ''}>
                            <span class="checkbox-visual" style="border-color: ${isCompleted ? 'transparent' : cat.color}">
                              <i data-lucide="check"></i>
                            </span>
                          </label>
                        ` : `
                          <!-- Metric Indicator dot -->
                          <div style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid ${isCompleted ? var('--neon-emerald') : cat.color}; display: flex; align-items: center; justify-content: center; font-size: 10px; color: ${isCompleted ? 'var(--neon-emerald)' : 'var(--text-muted)'};">
                            ${isCompleted ? '✓' : 'N'}
                          </div>
                        `}

                        <div class="habit-meta-details">
                          <span class="habit-card-title" style="${isCompleted ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${h.title}</span>
                          <span class="habit-card-sub">
                            <span>🔁 ${h.frequency}</span>
                            <span>🎯 Target: ${h.target_value} ${h.unit}</span>
                            ${h.streak > 0 ? `<span style="color: var(--neon-amber); font-weight: 600;">🔥 ${h.streak}d streak</span>` : ''}
                            ${isCompleted ? `<span style="color: var(--neon-emerald); font-weight: 500;">Logged: ${logVal} ${h.unit}</span>` : ''}
                          </span>
                        </div>
                      </div>

                      <!-- Metric Logging controls (only for quantity metric logs) -->
                      ${h.metric_type === 'number' ? `
                        <div class="metric-logger-wrap">
                          <div class="metric-input-wrapper">
                            <input type="number" class="metric-log-input" id="metric-input-${h.id}" value="${logVal || ''}" placeholder="0">
                            <span class="metric-unit">${h.unit}</span>
                          </div>
                          <button class="btn-log-metric btn-save-num-metric" data-habit-id="${h.id}" title="Save Metric">
                            <i data-lucide="save"></i>
                          </button>
                        </div>
                      ` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            `;
          }).join('')}
          
          ${habits.length > 0 && habits.every(h => h.category_id && catMap[h.category_id].habits.length === 0) ? `
            <div class="glass-panel empty-state">
              <i data-lucide="info"></i>
              <p>No actions defined in your current skills. Select the Goal Tree view to configure them.</p>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    this.container.innerHTML = content;
    lucide.createIcons();
    this.initListeners();
  },

  initListeners() {
    const handleSound = () => {
      window.dispatchEvent(new CustomEvent('play-sound', { detail: { type: 'click' } }));
    };

    // Go to Tree Button if empty
    const goTreeBtn = this.container.querySelector('#btn-tracker-go-tree');
    if (goTreeBtn) {
      goTreeBtn.addEventListener('click', () => {
        handleSound();
        this.app.navigateTo('tree');
      });
    }

    // Binary checkbox logs
    const checkInputs = this.container.querySelectorAll('.habit-check-input');
    checkInputs.forEach(input => {
      input.addEventListener('change', () => {
        const habitId = input.getAttribute('data-habit-id');
        const todayStr = new Date().toISOString().split('T')[0];
        const val = input.checked ? 1 : 0;
        
        db.logHabit(habitId, todayStr, val);
        db.checkAchievements();
        this.render(this.container, this.app); // Re-render tracker
        this.app.syncSidebar(); // Sync level/XP sidebar
      });
    });

    // Numerical Save Metric click
    const saveMetricBtns = this.container.querySelectorAll('.btn-save-num-metric');
    saveMetricBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        handleSound();
        const habitId = btn.getAttribute('data-habit-id');
        const valInput = this.container.querySelector(`#metric-input-${habitId}`);
        
        const value = Number(valInput.value);
        if (isNaN(value) || value < 0) {
          triggerToast('Please enter a valid numeric log value.', 'error');
          return;
        }

        const todayStr = new Date().toISOString().split('T')[0];
        db.logHabit(habitId, todayStr, value);
        db.checkAchievements();
        this.render(this.container, this.app);
        this.app.syncSidebar();
      });
    });
  }
};
export default DailyTracker;
