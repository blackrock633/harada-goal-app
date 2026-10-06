/* ==========================================================================
   ASCEND COMPONENT: AI GOAL BUILDER & CHAT INTERFACE
   ========================================================================== */

import { db, triggerToast } from '../utils/db.js';

// Pre-defined local templates for quick mock AI responses
const LOCAL_AI_TEMPLATES = {
  frisbee: {
    goalTitle: "Become an Elite Ultimate Frisbee Player",
    goalDescription: "Improve athletic speed, throwing precision, and tactical field execution.",
    categories: [
      {
        title: "Throwing Power",
        color: "#00f2fe",
        habits: [
          { title: "200 throws with pivot marks", frequency: "daily", metric_type: "number", target_value: 200, unit: "throws" },
          { title: "Long-range huck training", frequency: "weekly", metric_type: "binary", target_value: 2, unit: "sessions" }
        ]
      },
      {
        title: "Speed Endurance",
        color: "#9d4edd",
        habits: [
          { title: "HIIT sprint repeats (40 yards)", frequency: "weekly", metric_type: "binary", target_value: 3, unit: "runs" },
          { title: "Footwork ladder drills", frequency: "daily", metric_type: "number", target_value: 15, unit: "mins" }
        ]
      },
      {
        title: "Tactical IQ",
        color: "#00f5a0",
        habits: [
          { title: "Watch elite game film footage", frequency: "daily", metric_type: "number", target_value: 20, unit: "mins" },
          { title: "Review cutting/defensive plans", frequency: "weekly", metric_type: "binary", target_value: 1, unit: "sessions" }
        ]
      }
    ]
  },
  soccer: {
    goalTitle: "Make Varsity Soccer Roster",
    goalDescription: "Develop supreme ball manipulation, tactical placement, and speed stamina.",
    categories: [
      {
        title: "Ball Control",
        color: "#00f2fe",
        habits: [
          { title: "Wall passes & target shots", frequency: "daily", metric_type: "number", target_value: 30, unit: "mins" },
          { title: "Juggling & cone dribbles", frequency: "daily", metric_type: "number", target_value: 20, unit: "mins" }
        ]
      },
      {
        title: "Match Fitness",
        color: "#9d4edd",
        habits: [
          { title: "3-mile endurance run", frequency: "weekly", metric_type: "binary", target_value: 2, unit: "runs" },
          { title: "Interval sprints", frequency: "weekly", metric_type: "binary", target_value: 2, unit: "runs" }
        ]
      },
      {
        title: "Match IQ",
        color: "#ff9f1c",
        habits: [
          { title: "Analyze match videos", frequency: "weekly", metric_type: "number", target_value: 1, unit: "session" },
          { title: "Core & ankle strength routines", frequency: "daily", metric_type: "binary", target_value: 1, unit: "sessions" }
        ]
      }
    ]
  },
  startup: {
    goalTitle: "Launch Startup MVP product",
    goalDescription: "Build, launch, and validate a SaaS prototype to secure beta signups.",
    categories: [
      {
        title: "Tech Delivery",
        color: "#00f2fe",
        habits: [
          { title: "Write backend/frontend code", frequency: "daily", metric_type: "number", target_value: 60, unit: "mins" },
          { title: "Push production deployment updates", frequency: "weekly", metric_type: "binary", target_value: 3, unit: "commits" }
        ]
      },
      {
        title: "Customer Development",
        color: "#9d4edd",
        habits: [
          { title: "Conduct user feedback calls", frequency: "weekly", metric_type: "number", target_value: 2, unit: "interviews" },
          { title: "Engage early waitlist signups", frequency: "daily", metric_type: "binary", target_value: 1, unit: "sessions" }
        ]
      },
      {
        title: "Growth & Pitch",
        color: "#00f5a0",
        habits: [
          { title: "Draft technical SEO articles", frequency: "weekly", metric_type: "binary", target_value: 1, unit: "articles" },
          { title: "Social media marketing content", frequency: "daily", metric_type: "binary", target_value: 1, unit: "posts" }
        ]
      }
    ]
  },
  fitness: {
    goalTitle: "Peak Physical Conditioning",
    goalDescription: "Gain muscle density, enhance cardiac threshold, and establish food consistency.",
    categories: [
      {
        title: "Hypertrophy",
        color: "#00f2fe",
        habits: [
          { title: "Weight training split", frequency: "weekly", metric_type: "binary", target_value: 4, unit: "sessions" },
          { title: "Post-workout flexibility stretching", frequency: "daily", metric_type: "binary", target_value: 1, unit: "sessions" }
        ]
      },
      {
        title: "Stamina Core",
        color: "#9d4edd",
        habits: [
          { title: "Zone-2 steady cardio running", frequency: "weekly", metric_type: "number", target_value: 90, unit: "mins" },
          { title: "Core plank & sit-ups circuits", frequency: "daily", metric_type: "binary", target_value: 1, unit: "sessions" }
        ]
      },
      {
        title: "Nutrition",
        color: "#00f5a0",
        habits: [
          { title: "Drink high water intake", frequency: "daily", metric_type: "number", target_value: 3, unit: "litres" },
          { title: "Log clean caloric profile", frequency: "daily", metric_type: "binary", target_value: 1, unit: "meals" }
        ]
      }
    ]
  },
  marathon: {
    goalTitle: "Run a Sub-4 Hour Marathon",
    goalDescription: "Develop physical cardiovascular capacity, lower-body resilience, and race pacing strategy.",
    categories: [
      {
        title: "Aerobic Endurance",
        color: "#00f2fe",
        habits: [
          { title: "Long endurance run session", frequency: "weekly", metric_type: "binary", target_value: 1, unit: "runs" },
          { title: "Zone-2 base runs", frequency: "weekly", metric_type: "number", target_value: 3, unit: "runs" }
        ]
      },
      {
        title: "Strength & Core",
        color: "#9d4edd",
        habits: [
          { title: "Leg resistance routine", frequency: "weekly", metric_type: "binary", target_value: 2, unit: "sessions" },
          { title: "Post-run flexibility stretching", frequency: "daily", metric_type: "binary", target_value: 1, unit: "stretches" }
        ]
      },
      {
        title: "Pacing & Recovery",
        color: "#00f5a0",
        habits: [
          { title: "Track hydration levels", frequency: "daily", metric_type: "number", target_value: 3, unit: "litres" },
          { title: "Night sleep recovery time", frequency: "daily", metric_type: "number", target_value: 8, unit: "hours" }
        ]
      }
    ]
  },
  gpa: {
    goalTitle: "Achieve a 4.0 Academic GPA",
    goalDescription: "Establish disciplined study systems, review classroom materials, and optimize test preparation.",
    categories: [
      {
        title: "Study Sessions",
        color: "#00f2fe",
        habits: [
          { title: "Deep study Pomodoro sessions", frequency: "daily", metric_type: "number", target_value: 4, unit: "pomodoros" },
          { title: "Maintain clean workspaces", frequency: "daily", metric_type: "binary", target_value: 1, unit: "sessions" }
        ]
      },
      {
        title: "Active Recall",
        color: "#9d4edd",
        habits: [
          { title: "Active recall study flashcards", frequency: "daily", metric_type: "number", target_value: 20, unit: "cards" },
          { title: "Weekly review sheets", frequency: "weekly", metric_type: "binary", target_value: 1, unit: "sheets" }
        ]
      },
      {
        title: "Exam & Class Prep",
        color: "#00f5a0",
        habits: [
          { title: "Solve practice problems", frequency: "weekly", metric_type: "number", target_value: 15, unit: "problems" },
          { title: "Pre-read lecture slide sheets", frequency: "daily", metric_type: "binary", target_value: 1, unit: "sessions" }
        ]
      }
    ]
  }
};

// Generic fallback template generator
function generateGenericTemplate(goalTitle) {
  const cleanTitle = goalTitle || "My Personal Ascent";
  return {
    goalTitle: cleanTitle,
    goalDescription: "Improve focus, structure habits, and measure progression across life domains.",
    categories: [
      {
        title: "Craft & Skill",
        color: "#00f2fe",
        habits: [
          { title: "Practice craft core exercises", frequency: "daily", metric_type: "number", target_value: 30, unit: "mins" },
          { title: "Build complex subprojects", frequency: "weekly", metric_type: "binary", target_value: 1, unit: "sessions" }
        ]
      },
      {
        title: "Body & Energy",
        color: "#9d4edd",
        habits: [
          { title: "Physical mobility / workout", frequency: "daily", metric_type: "binary", target_value: 1, unit: "workouts" },
          { title: "Sleep cycle hydration check", frequency: "daily", metric_type: "number", target_value: 8, unit: "hours" }
        ]
      },
      {
        title: "Mind & Strategy",
        color: "#00f5a0",
        habits: [
          { title: "Review tactical guidelines", frequency: "weekly", metric_type: "binary", target_value: 2, unit: "reviews" },
          { title: "Mindfulness alignment prep", frequency: "daily", metric_type: "number", target_value: 10, unit: "mins" }
        ]
      }
    ]
  };
}

export const AIAssistant = {
  messages: [],
  draftTree: null, // Holds the current tree template being edited
  apiConfigOpen: false,

  render(container, app) {
    this.container = container;
    this.app = app;
    this.messages = [
      { sender: 'assistant', text: "Hello! I am the **Ascend AI Builder**. Describe a goal you'd like to achieve, and I'll generate a custom layout of skill categories and actionable daily habits to help you reach it." }
    ];
    this.draftTree = null;

    this.renderUI();

    // Check if redirecting from onboarding onboarding draft
    const draftTitle = sessionStorage.getItem('ascend_draft_goal_title');
    if (draftTitle) {
      sessionStorage.removeItem('ascend_draft_goal_title');
      const draftDesc = sessionStorage.getItem('ascend_draft_goal_desc') || '';
      const draftDate = sessionStorage.getItem('ascend_draft_goal_date') || '';
      
      this.messages.push({ sender: 'user', text: `Generate a goal tree for: "${draftTitle}"${draftDesc ? ` - ${draftDesc}` : ''}` });
      this.renderMessages();
      this.generateGoalTree(draftTitle, draftDesc, draftDate);
    }
  },

  renderUI() {
    const savedKey = localStorage.getItem('ascend_gemini_api_key') || '';

    this.container.innerHTML = `
      <div class="ai-screen-layout fade-in">
        <!-- Chat Panel -->
        <div class="glass-panel ai-chat-card">
          <div class="panel-header">
            <div class="panel-title">
              <i data-lucide="sparkles" style="color: var(--neon-cyan);"></i> AI Companion
            </div>
          </div>

          <div class="ai-chat-messages custom-scroll" id="ai-chat-box">
            <!-- Messages render here -->
          </div>

          <div class="ai-chat-input-wrap">
            <textarea id="ai-chat-textarea" placeholder="Describe your goal, e.g. I want to run a marathon..."></textarea>
            <button id="btn-ai-send" title="Generate"><i data-lucide="send"></i></button>
          </div>

          <!-- Collapsible API Configuration Panel -->
          <div class="api-config-panel">
            <div class="api-config-toggle" id="api-panel-toggle">
              <i data-lucide="settings" style="width: 12px; height: 12px;"></i> 
              <span>${this.apiConfigOpen ? 'Hide API Settings' : 'Use Custom API Key (Gemini)'}</span>
            </div>
            <div class="api-inputs-container" id="api-inputs-wrap" style="display: ${this.apiConfigOpen ? 'flex' : 'none'};">
              <input type="password" id="gemini-key-input" placeholder="Paste Gemini API Key..." value="${savedKey}">
              <div style="font-size: 10px; color: var(--text-muted); line-height: 1.3;">
                Key is saved locally on your browser. Leaving this empty uses our smart mock engine fallback.
              </div>
            </div>
          </div>
        </div>

        <!-- Draft Tree Preview Panel -->
        <div class="glass-panel ai-preview-panel">
          <div class="ai-preview-header">
            <div class="panel-title">
              <i data-lucide="git-branch" style="color: var(--neon-purple);"></i> Skill Tree Draft
            </div>
            <button class="btn-primary" id="btn-ai-accept-tree" style="font-size: 11px; padding: 6px 12px; display: none;">
              Initialize Active Tree <i data-lucide="plus"></i>
            </button>
          </div>

          <div class="preview-tree-editor custom-scroll" id="preview-editor-box">
            <div class="empty-state">
              <i data-lucide="sparkles" style="opacity: 0.1; font-size: 48px;"></i>
              <p>Type a goal in the assistant chat to generate a structure draft here.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    lucide.createIcons();
    this.renderMessages();
    this.initListeners();
  },

  renderMessages() {
    const chatBox = this.container.querySelector('#ai-chat-box');
    if (!chatBox) return;

    chatBox.innerHTML = this.messages.map(msg => `
      <div class="message-bubble ${msg.sender}">
        ${msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
      </div>
    `).join('');

    chatBox.scrollTop = chatBox.scrollHeight;
  },

  async generateGoalTree(title, desc = '', targetDate = '') {
    this.messages.push({ sender: 'assistant', text: "Processing goal request... structuring skill nodes..." });
    this.renderMessages();

    const apiKey = localStorage.getItem('ascend_gemini_api_key');
    let generatedObj = null;

    if (apiKey && apiKey.trim()) {
      // 1. Live Query to Google Gemini API
      try {
        generatedObj = await this.queryGeminiAPI(apiKey, title, desc);
        triggerToast('AI response generated successfully!', 'success');
      } catch (err) {
        console.error(err);
        this.messages.push({ sender: 'assistant', text: `⚠️ API error encountered: ${err.message}. Falling back to smart templates.` });
        this.renderMessages();
        generatedObj = this.getFallbackTemplate(title);
      }
    } else {
      // 2. Fallback local matcher
      await new Promise(r => setTimeout(r, 1000)); // fake delay
      generatedObj = this.getFallbackTemplate(title);
    }

    if (targetDate) {
      generatedObj.targetDate = targetDate;
    }

    this.draftTree = generatedObj;

    // Output status
    this.messages.pop(); // remove thinking message
    this.messages.push({ sender: 'assistant', text: `Done! I've loaded a draft for **${generatedObj.goalTitle}** on the right. You can edit the categories, customize habit targets, and approve the tree to launch.` });
    
    this.renderMessages();
    this.renderDraftEditor();
  },

  async queryGeminiAPI(key, title, desc) {
    const prompt = `Analyze the following user goal: "Title: ${title}. Description: ${desc}". 
    Create a structured goal system breaking it into 3 to 4 skill categories, and 2 habits per category.
    Respond ONLY with a JSON object in this exact format (do NOT wrap it in markdown code blocks like \`\`\`json, do NOT add extra text outside the JSON):
    {
      "goalTitle": "A concise title summarizing the goal",
      "goalDescription": "A summary of the action plan",
      "categories": [
        {
          "title": "Skill Category Name (e.g. Ball Handling, Game Tactics)",
          "color": "#HEX (Choose colorful neon hex codes: #00f2fe, #9d4edd, #00f5a0, #ff9f1c, #ff3366)",
          "habits": [
            {
              "title": "Actionable Habit (e.g. 30 mins dribbling drills)",
              "frequency": "daily",
              "metric_type": "number",
              "target_value": 30,
              "unit": "mins"
            }
          ]
        }
      ]
    }`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error('Empty response from Gemini API');
    }

    // Clean JSON response
    let cleanJSON = responseText.trim();
    if (cleanJSON.startsWith('```')) {
      cleanJSON = cleanJSON.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    }

    return JSON.parse(cleanJSON);
  },

  getFallbackTemplate(query) {
    const q = query.toLowerCase();
    if (q.includes('soccer') || q.includes('football')) {
      return JSON.parse(JSON.stringify(LOCAL_AI_TEMPLATES.soccer));
    }
    if (q.includes('frisbee') || q.includes('ultimate') || q.includes('mamabird')) {
      return JSON.parse(JSON.stringify(LOCAL_AI_TEMPLATES.frisbee));
    }
    if (q.includes('startup') || q.includes('business') || q.includes('saas') || q.includes('product')) {
      return JSON.parse(JSON.stringify(LOCAL_AI_TEMPLATES.startup));
    }
    if (q.includes('marathon') || q.includes('race') || q.includes('running')) {
      return JSON.parse(JSON.stringify(LOCAL_AI_TEMPLATES.marathon));
    }
    if (q.includes('gpa') || q.includes('grade') || q.includes('study') || q.includes('academic') || q.includes('exam')) {
      return JSON.parse(JSON.stringify(LOCAL_AI_TEMPLATES.gpa));
    }
    if (q.includes('fitness') || q.includes('gym') || q.includes('lift') || q.includes('weight') || q.includes('run')) {
      return JSON.parse(JSON.stringify(LOCAL_AI_TEMPLATES.fitness));
    }
    return generateGenericTemplate(query);
  },

  renderDraftEditor() {
    const box = this.container.querySelector('#preview-editor-box');
    const acceptBtn = this.container.querySelector('#btn-ai-accept-tree');
    
    if (!this.draftTree) {
      box.innerHTML = `
        <div class="empty-state">
          <i data-lucide="sparkles" style="opacity: 0.1; font-size: 48px;"></i>
          <p>Draft generated will show here.</p>
        </div>
      `;
      acceptBtn.style.display = 'none';
      lucide.createIcons();
      return;
    }

    acceptBtn.style.display = 'flex';

    box.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 20px; padding-bottom: 24px;">
        <!-- Goal Details -->
        <div class="glass-panel" style="padding: 16px;">
          <h4 style="font-family: var(--font-display); font-size: 11px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">GOAL DETAILS</h4>
          <div class="form-group" style="margin-bottom: 12px;">
            <label>Goal Title</label>
            <input type="text" id="draft-goal-title" value="${this.draftTree.goalTitle}">
          </div>
          <div class="form-group">
            <label>Description</label>
            <input type="text" id="draft-goal-desc" value="${this.draftTree.goalDescription}">
          </div>
        </div>

        <!-- Categories Editor -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <h4 style="font-family: var(--font-display); font-size: 11px; color: var(--text-muted); text-transform: uppercase;">SKILL NODES & ACTIONS</h4>
          
          ${this.draftTree.categories.map((cat, catIdx) => `
            <div class="ai-config-item" style="border-left: 4px solid ${cat.color};">
              <div class="ai-config-row">
                <input type="text" class="ai-input-title category-draft-title" data-cat-idx="${catIdx}" value="${cat.title}">
                <button class="ai-trash-btn btn-draft-delete-cat" data-cat-idx="${catIdx}">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>

              <!-- Habits Preview -->
              <div class="ai-habit-preview-list">
                ${cat.habits.map((h, habIdx) => `
                  <div class="ai-habit-preview-item">
                    <div style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
                      <input type="text" class="habit-draft-title" data-cat-idx="${catIdx}" data-hab-idx="${habIdx}" value="${h.title}" 
                             style="background: transparent; border: none; font-size: 12px; color: white; width: 90%; outline: none; border-bottom: 1px dashed transparent;">
                      <div style="font-size: 10px; color: var(--text-secondary); display: flex; gap: 6px; align-items: center; margin-top: 4px;">
                        <span style="cursor: pointer;" class="toggle-freq-draft" data-cat-idx="${catIdx}" data-hab-idx="${habIdx}">🔁 ${h.frequency}</span>
                        <span>🎯 ${h.metric_type === 'binary' ? 'check' : `${h.target_value} ${h.unit}`}</span>
                      </div>
                    </div>
                    <button class="ai-trash-btn btn-draft-delete-hab" data-cat-idx="${catIdx}" data-hab-idx="${habIdx}">
                      <i data-lucide="x"></i>
                    </button>
                  </div>
                `).join('')}

                <!-- Quick Add Habit Inside Draft -->
                <button class="btn-secondary btn-draft-add-hab" data-cat-idx="${catIdx}" style="font-size: 10px; padding: 4px 8px; align-self: flex-start; margin-top: 4px;">
                  + Add Action
                </button>
              </div>
            </div>
          `).join('')}

          <button class="btn-secondary" id="btn-draft-new-cat" style="justify-content: center; font-size: 11px;">
            + Add New Skill Category
          </button>
        </div>
      </div>
    `;

    lucide.createIcons({ attrs: { style: 'width: 14px; height: 14px;' } });
    this.initDraftListeners();
  },

  initListeners() {
    const handleSound = () => {
      window.dispatchEvent(new CustomEvent('play-sound', { detail: { type: 'click' } }));
    };

    // Chat send button
    const sendBtn = this.container.querySelector('#btn-ai-send');
    const textarea = this.container.querySelector('#ai-chat-textarea');
    const triggerSend = () => {
      const text = textarea.value.trim();
      if (!text) return;
      handleSound();

      this.messages.push({ sender: 'user', text });
      textarea.value = '';
      this.renderMessages();
      this.generateGoalTree(text);
    };

    sendBtn.addEventListener('click', triggerSend);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        triggerSend();
      }
    });

    // API settings toggle
    const togglePanelBtn = this.container.querySelector('#api-panel-toggle');
    togglePanelBtn.addEventListener('click', () => {
      handleSound();
      this.apiConfigOpen = !this.apiConfigOpen;
      this.renderUI();
    });

    // Save key changes
    const keyInput = this.container.querySelector('#gemini-key-input');
    if (keyInput) {
      keyInput.addEventListener('change', () => {
        localStorage.setItem('ascend_gemini_api_key', keyInput.value.trim());
        triggerToast('Gemini API key saved.', 'success');
      });
    }

    // Initialize Tree Button
    const acceptBtn = this.container.querySelector('#btn-ai-accept-tree');
    acceptBtn.addEventListener('click', () => {
      handleSound();
      if (!this.draftTree) return;

      // Update goal stats from form inputs
      const goalTitleInput = this.container.querySelector('#draft-goal-title');
      const goalDescInput = this.container.querySelector('#draft-goal-desc');

      const finalGoalTitle = goalTitleInput.value.trim() || this.draftTree.goalTitle;
      const finalGoalDesc = goalDescInput.value.trim() || this.draftTree.goalDescription;

      // Reset coordinates and databases
      const activeGoal = db.addGoal(finalGoalTitle, finalGoalDesc, this.draftTree.targetDate || '');
      
      this.draftTree.categories.forEach(cat => {
        const newCat = db.addCategory(activeGoal.id, cat.title, cat.color);
        cat.habits.forEach(h => {
          db.addHabit(newCat.id, h.title, h.frequency, h.metric_type, h.target_value, h.unit);
        });
      });

      db.setActiveGoalId(activeGoal.id);
      db.checkAchievements();
      this.app.syncSidebar();
      triggerToast(`Goal System "${finalGoalTitle}" successfully deployed!`, 'success');
      
      // Redirect to main goal tree view
      this.app.navigateTo('tree');
    });
  },

  initDraftListeners() {
    const handleSound = () => {
      window.dispatchEvent(new CustomEvent('play-sound', { detail: { type: 'click' } }));
    };

    // Category title change in draft
    const catTitles = this.container.querySelectorAll('.category-draft-title');
    catTitles.forEach(input => {
      input.addEventListener('change', () => {
        const catIdx = Number(input.getAttribute('data-cat-idx'));
        this.draftTree.categories[catIdx].title = input.value.trim();
      });
    });

    // Delete Category in draft
    const delCatBtns = this.container.querySelectorAll('.btn-draft-delete-cat');
    delCatBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        handleSound();
        const catIdx = Number(btn.getAttribute('data-cat-idx'));
        this.draftTree.categories.splice(catIdx, 1);
        this.renderDraftEditor();
      });
    });

    // Habit title change in draft
    const habTitles = this.container.querySelectorAll('.habit-draft-title');
    habTitles.forEach(input => {
      input.addEventListener('change', () => {
        const catIdx = Number(input.getAttribute('data-cat-idx'));
        const habIdx = Number(input.getAttribute('data-hab-idx'));
        this.draftTree.categories[catIdx].habits[habIdx].title = input.value.trim();
      });
    });

    // Toggle frequency in draft
    const toggleFreqLinks = this.container.querySelectorAll('.toggle-freq-draft');
    toggleFreqLinks.forEach(lnk => {
      lnk.addEventListener('click', () => {
        handleSound();
        const catIdx = Number(lnk.getAttribute('data-cat-idx'));
        const habIdx = Number(lnk.getAttribute('data-hab-idx'));
        const hab = this.draftTree.categories[catIdx].habits[habIdx];
        hab.frequency = hab.frequency === 'daily' ? 'weekly' : 'daily';
        this.renderDraftEditor();
      });
    });

    // Delete habit in draft
    const delHabBtns = this.container.querySelectorAll('.btn-draft-delete-hab');
    delHabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        handleSound();
        const catIdx = Number(btn.getAttribute('data-cat-idx'));
        const habIdx = Number(btn.getAttribute('data-hab-idx'));
        this.draftTree.categories[catIdx].habits.splice(habIdx, 1);
        this.renderDraftEditor();
      });
    });

    // Add habit inside draft category
    const addHabBtns = this.container.querySelectorAll('.btn-draft-add-hab');
    addHabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        handleSound();
        const catIdx = Number(btn.getAttribute('data-cat-idx'));
        const newHabName = prompt("Enter habit action name:");
        if (!newHabName || !newHabName.trim()) return;

        this.draftTree.categories[catIdx].habits.push({
          title: newHabName.trim(),
          frequency: 'daily',
          metric_type: 'binary',
          target_value: 1,
          unit: 'reps'
        });
        this.renderDraftEditor();
      });
    });

    // Add new category to draft
    const newCatBtn = this.container.querySelector('#btn-draft-new-cat');
    newCatBtn.addEventListener('click', () => {
      handleSound();
      const newCatName = prompt("Enter category name:");
      if (!newCatName || !newCatName.trim()) return;

      const colors = ['#00f2fe', '#9d4edd', '#00f5a0', '#ff9f1c', '#ff3366'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      this.draftTree.categories.push({
        title: newCatName.trim(),
        color: randomColor,
        habits: []
      });
      this.renderDraftEditor();
    });
  }
};
export default AIAssistant;
