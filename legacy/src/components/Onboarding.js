/* ==========================================================================
   ASCEND COMPONENT: ONBOARDING WIZARD
   ========================================================================== */

import { db, triggerToast } from '../utils/db.js';

export const Onboarding = {
  currentStep: 1,
  formData: {
    title: '',
    description: '',
    target_date: ''
  },

  render(container, app) {
    this.container = container;
    this.app = app;
    this.currentStep = 1;
    this.formData = { title: '', description: '', target_date: '' };

    this.showStep();
  },

  showStep() {
    let content = '';

    if (this.currentStep === 1) {
      content = `
        <div class="glass-panel onboarding-card fade-in">
          <div class="onboarding-steps">
            <div class="onboarding-step-indicator active"></div>
            <div class="onboarding-step-indicator"></div>
          </div>
          
          <div class="onboarding-step-content">
            <div class="screen-title" style="margin-bottom: 8px;">
              <h1>Define Your Ascent</h1>
              <p>What major milestone or vision are you striving to achieve?</p>
            </div>

            <div class="form-group">
              <label for="goal-title-input">Main Goal Title *</label>
              <input type="text" id="goal-title-input" placeholder="e.g. Make varsity soccer, Launch my startup, Run a sub-4 marathon" value="${this.formData.title}">
            </div>

            <div class="form-group">
              <label for="goal-desc-input">Description / Core Purpose</label>
              <input type="text" id="goal-desc-input" placeholder="What is the significance of this goal? Why does it matter?" value="${this.formData.description}">
            </div>

            <div class="form-group">
              <label for="goal-date-input">Target Achievement Date (Optional)</label>
              <input type="date" id="goal-date-input" value="${this.formData.target_date}">
            </div>
          </div>

          <div class="onboarding-actions" style="justify-content: flex-end;">
            <button class="btn-primary" id="btn-onboard-next">
              Next Step <i data-lucide="arrow-right"></i>
            </button>
          </div>
        </div>
      `;
    } else {
      content = `
        <div class="glass-panel onboarding-card fade-in">
          <div class="onboarding-steps">
            <div class="onboarding-step-indicator"></div>
            <div class="onboarding-step-indicator active"></div>
          </div>

          <div class="onboarding-step-content">
            <div class="screen-title" style="margin-bottom: 8px;">
              <h1>Choose Your Path</h1>
              <p>How would you like to build your goal progression tree?</p>
            </div>

            <div class="flow-choice-grid">
              <div class="choice-card" data-choice="manual">
                <div class="choice-icon">🔨</div>
                <div class="choice-title">Manual Build</div>
                <div class="choice-desc">Craft categories, subgoals, and habits from scratch to map out your own structure.</div>
              </div>

              <div class="choice-card" data-choice="ai">
                <div class="choice-icon">✨</div>
                <div class="choice-title">AI Assistant</div>
                <div class="choice-desc">Describe your goal and let the AI draft suggested categories and habits.</div>
              </div>
            </div>

            <div class="form-group" style="margin-top: 12px;">
              <label style="margin-bottom: 12px; display: block; text-align: center; color: var(--text-muted);">— OR CHOOSE AN INSTANT TEMPLATE —</label>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(105px, 1fr)); gap: 10px;">
                <button class="btn-secondary template-quick-btn" data-template="soccer" style="justify-content: center; font-size: 11px; padding: 8px 4px;">⚽ Soccer</button>
                <button class="btn-secondary template-quick-btn" data-template="ultimate" style="justify-content: center; font-size: 11px; padding: 8px 4px;">🥏 Frisbee</button>
                <button class="btn-secondary template-quick-btn" data-template="startup" style="justify-content: center; font-size: 11px; padding: 8px 4px;">🚀 Startup</button>
                <button class="btn-secondary template-quick-btn" data-template="marathon" style="justify-content: center; font-size: 11px; padding: 8px 4px;">🏃‍♂️ Marathon</button>
                <button class="btn-secondary template-quick-btn" data-template="gpa" style="justify-content: center; font-size: 11px; padding: 8px 4px;">🎓 4.0 GPA</button>
              </div>
            </div>
          </div>

          <div class="onboarding-actions">
            <button class="btn-secondary" id="btn-onboard-back">
              <i data-lucide="arrow-left"></i> Back
            </button>
          </div>
        </div>
      `;
    }

    this.container.innerHTML = `<div id="onboarding-screen">${content}</div>`;
    lucide.createIcons();
    this.initListeners();
  },

  initListeners() {
    const handleSound = () => {
      window.dispatchEvent(new CustomEvent('play-sound', { detail: { type: 'click' } }));
    };

    if (this.currentStep === 1) {
      const nextBtn = this.container.querySelector('#btn-onboard-next');
      nextBtn.addEventListener('click', () => {
        handleSound();
        const titleInput = this.container.querySelector('#goal-title-input');
        const descInput = this.container.querySelector('#goal-desc-input');
        const dateInput = this.container.querySelector('#goal-date-input');

        if (!titleInput.value.trim()) {
          triggerToast('Please enter a goal title to proceed.', 'error');
          return;
        }

        this.formData.title = titleInput.value.trim();
        this.formData.description = descInput.value.trim();
        this.formData.target_date = dateInput.value;

        this.currentStep = 2;
        this.showStep();
      });
    } else {
      const backBtn = this.container.querySelector('#btn-onboard-back');
      backBtn.addEventListener('click', () => {
        handleSound();
        this.currentStep = 1;
        this.showStep();
      });

      // Handle custom choice cards
      const choiceCards = this.container.querySelectorAll('.choice-card');
      choiceCards.forEach(card => {
        card.addEventListener('click', () => {
          handleSound();
          const choice = card.getAttribute('data-choice');
          if (choice === 'manual') {
            // Create main goal and send user to tree view
            const goal = db.addGoal(this.formData.title, this.formData.description, this.formData.target_date);
            triggerToast(`Goal "${goal.title}" created. Add skill nodes below!`, 'success');
            db.checkAchievements();
            this.app.syncSidebar();
            this.app.navigateTo('tree');
          } else if (choice === 'ai') {
            // Redirect to AI page and auto-input target goal
            sessionStorage.setItem('ascend_draft_goal_title', this.formData.title);
            sessionStorage.setItem('ascend_draft_goal_desc', this.formData.description);
            sessionStorage.setItem('ascend_draft_goal_date', this.formData.target_date);
            this.app.navigateTo('assistant');
          }
        });
      });

      // Handle Quick Templates
      const templateBtns = this.container.querySelectorAll('.template-quick-btn');
      templateBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          handleSound();
          const templateType = btn.getAttribute('data-template');
          db.loadTemplate(templateType);
          db.checkAchievements();
          this.app.syncSidebar();
          this.app.navigateTo('tree');
        });
      });
    }
  }
};
export default Onboarding;
