/* ==========================================================================
   ASCEND MAIN APPLICATION HUB (Vanilla JS ES Module Router)
   ========================================================================== */

import { db, triggerToast } from './utils/db.js';
import { audio } from './utils/audio.js';
import { Onboarding } from './components/Onboarding.js';
import { Dashboard } from './components/Dashboard.js';
import { GoalTree } from './components/GoalTree.js';
import { DailyTracker } from './components/DailyTracker.js';
import { AIAssistant } from './components/AIAssistant.js';
import { Analytics } from './components/Analytics.js';

const App = {
  currentScreen: 'dashboard',
  viewport: null,

  init() {
    // 1. Initialize databases and audio nodes
    db.init();
    audio.init();

    this.viewport = document.getElementById('screen-viewport');

    // 2. Bind sidebar navigations
    this.bindNavigation();

    // 3. Setup global listeners
    this.setupGlobalEventListeners();

    // 4. Load initial state
    this.syncSidebar();
    
    const goals = db.getGoals();
    if (goals.length === 0) {
      this.navigateTo('onboarding');
    } else {
      this.navigateTo('dashboard');
    }

    triggerToast('Ascend Protocols Initialized. Level Up.', 'info');
  },

  navigateTo(screenKey) {
    this.currentScreen = screenKey;
    
    // Add slide-out fade effect
    this.viewport.style.opacity = '0';
    this.viewport.style.transform = 'translateY(6px)';

    setTimeout(() => {
      // Clear viewport and render target view
      this.viewport.innerHTML = '';
      
      switch (screenKey) {
        case 'onboarding':
          Onboarding.render(this.viewport, this);
          break;
        case 'dashboard':
          Dashboard.render(this.viewport, this);
          break;
        case 'tree':
          GoalTree.render(this.viewport, this);
          break;
        case 'tracker':
          DailyTracker.render(this.viewport, this);
          break;
        case 'assistant':
          AIAssistant.render(this.viewport, this);
          break;
        case 'analytics':
          Analytics.render(this.viewport, this);
          break;
        default:
          Dashboard.render(this.viewport, this);
      }

      // Re-trigger layout fading
      this.viewport.style.opacity = '1';
      this.viewport.style.transform = 'translateY(0)';
      
      // Update nav active indicator class
      this.updateActiveNavClass(screenKey);
      
      // Recalculate badge notifications
      this.updateDueHabitsBadge();
    }, 150);
  },

  updateActiveNavClass(screenKey) {
    const btns = document.querySelectorAll('.nav-btn');
    btns.forEach(btn => {
      const target = btn.getAttribute('data-screen');
      if (target === screenKey) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },

  bindNavigation() {
    const handleSound = () => {
      window.dispatchEvent(new CustomEvent('play-sound', { detail: { type: 'click' } }));
    };

    // Click tabs navigation
    const btns = document.querySelectorAll('.nav-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        handleSound();
        const screen = btn.getAttribute('data-screen');
        
        // Prevent accessing other pages if there are no goals configured yet
        const goals = db.getGoals();
        if (goals.length === 0 && screen !== 'onboarding' && screen !== 'assistant') {
          triggerToast('Please configure a goal target to unlock the system.', 'error');
          return;
        }

        this.navigateTo(screen);
      });
    });

    // Goal selector change
    const goalSelect = document.getElementById('active-goal-select');
    goalSelect.addEventListener('change', () => {
      handleSound();
      db.setActiveGoalId(goalSelect.value);
    });

    // Sound toggle button click
    const soundBtn = document.getElementById('btn-sound-toggle');
    this.updateSoundButtonUI(soundBtn);
    soundBtn.addEventListener('click', () => {
      const active = !db.isSoundEnabled();
      db.setSoundEnabled(active);
      this.updateSoundButtonUI(soundBtn);
      
      if (active) {
        // Trigger verification click tone
        window.dispatchEvent(new CustomEvent('play-sound', { detail: { type: 'click' } }));
      }
      triggerToast(active ? 'Sound FX Enabled' : 'Sound FX Muted', 'info');
    });

    // Data backups buttons
    const backupBtn = document.getElementById('btn-backup-data');
    backupBtn.addEventListener('click', () => {
      handleSound();
      const dataStr = db.exportData();
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `ascend_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      triggerToast('JSON data backup downloaded.', 'success');
    });

    const restoreBtn = document.getElementById('btn-restore-data');
    const restoreInput = document.getElementById('restore-file-input');
    restoreBtn.addEventListener('click', () => {
      handleSound();
      restoreInput.click();
    });

    restoreInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const success = db.importData(event.target.result);
        if (success) {
          setTimeout(() => window.location.reload(), 800);
        }
      };
      reader.readAsText(file);
    });
  },

  updateSoundButtonUI(btn) {
    if (db.isSoundEnabled()) {
      btn.innerHTML = '<i data-lucide="volume-2"></i>';
      btn.style.color = 'var(--neon-cyan)';
    } else {
      btn.innerHTML = '<i data-lucide="volume-x"></i>';
      btn.style.color = 'var(--text-muted)';
    }
    lucide.createIcons();
  },

  syncSidebar() {
    const stats = db.getUserStats();
    
    // Update labels
    document.getElementById('user-rank').textContent = stats.rank;
    document.getElementById('user-level').textContent = stats.level;
    document.getElementById('user-current-xp').textContent = stats.xp;
    document.getElementById('user-next-level-xp').textContent = stats.next_level_xp;
    
    // XP progress bar
    const xpPercent = Math.min(100, Math.round((stats.xp / stats.next_level_xp) * 100));
    document.getElementById('user-xp-fill').style.width = `${xpPercent}%`;

    // Populate active goals select list
    const goalSelect = document.getElementById('active-goal-select');
    const goals = db.getGoals();
    
    goalSelect.innerHTML = goals.map(g => `
      <option value="${g.id}" ${db.getActiveGoalId() === g.id ? 'selected' : ''}>${g.title}</option>
    `).join('');

    if (goals.length === 0) {
      goalSelect.innerHTML = '<option value="">No Active Paths</option>';
    }

    this.updateDueHabitsBadge();
  },

  updateDueHabitsBadge() {
    const activeGoalId = db.getActiveGoalId();
    const badge = document.getElementById('due-habits-badge');
    if (!activeGoalId) {
      badge.style.display = 'none';
      return;
    }

    const habits = db.getHabitsForGoal(activeGoalId);
    const dailyHabits = habits.filter(h => h.frequency === 'daily');
    const logs = db.getAllLogs();
    const todayStr = new Date().toISOString().split('T')[0];

    const completedToday = dailyHabits.filter(h => {
      const log = logs.find(l => l.habit_id === h.id && l.date === todayStr);
      return log && log.completion_value >= h.target_value;
    });

    const dueCount = dailyHabits.length - completedToday.length;

    if (dueCount > 0 && this.currentScreen !== 'onboarding') {
      badge.textContent = dueCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  },

  setupGlobalEventListeners() {
    // Listen to statistics rewards
    window.addEventListener('stats-updated', () => {
      this.syncSidebar();
    });

    // Listen to active goal selectors modifications
    window.addEventListener('active-goal-changed', (e) => {
      this.syncSidebar();
      // Reload current screen if applicable
      if (this.currentScreen !== 'onboarding') {
        this.navigateTo(this.currentScreen);
      }
    });

    // Custom Toast Notification overlay displayer
    window.addEventListener('show-toast', (e) => {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      
      const isLevelUp = e.detail.type === 'level-up';
      
      toast.className = `toast ${e.detail.type || 'info'}`;
      
      if (isLevelUp) {
        toast.innerHTML = `
          <div class="avatar-glow" style="width: 32px; height: 32px; font-size: 14px; box-shadow: var(--glow-shadow-emerald);">🔥</div>
          <div class="level-up-toast-content">
            <span class="level-up-toast-title">LEVEL UP DETECTED</span>
            <span class="toast-message">${e.detail.message}</span>
          </div>
        `;
      } else {
        toast.innerHTML = `
          <i data-lucide="info" style="width: 16px; height: 16px;"></i>
          <span class="toast-message">${e.detail.message}</span>
        `;
      }

      container.appendChild(toast);
      lucide.createIcons();

      // Show animation
      setTimeout(() => toast.classList.add('show'), 50);

      // Hide and remove toast
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    });
  }
};

// Start the Application
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
export default App;
