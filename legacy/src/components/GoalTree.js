/* ==========================================================================
   ASCEND COMPONENT: INTERACTIVE SVG GOAL TREE
   ========================================================================== */

import { db, triggerToast } from '../utils/db.js';

export const GoalTree = {
  dx: 0,
  dy: 0,
  scale: 1,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  
  isDraggingNode: false,
  draggedNodeId: null,
  dragNodeStartX: 0,
  dragNodeStartY: 0,

  nodeCoords: {}, // Persisted coordinates for nodes: { nodeId: { x, y } }
  selectedNodeId: null, // For drawer view

  render(container, app) {
    this.container = container;
    this.app = app;
    this.selectedNodeId = null;

    const activeGoalId = db.getActiveGoalId();
    if (!activeGoalId) {
      this.container.innerHTML = `
        <div class="glass-panel" style="max-width: 500px; margin: 80px auto; text-align: center;">
          <p>Please create a main goal on the Dashboard first.</p>
        </div>
      `;
      return;
    }

    // Load persisted coordinates from localStorage
    const savedCoords = localStorage.getItem(`ascend_coords_${activeGoalId}`);
    this.nodeCoords = savedCoords ? JSON.parse(savedCoords) : {};

    this.container.innerHTML = `
      <div id="tree-screen-container" class="fade-in">
        <!-- Floating Canvas Controls -->
        <div class="canvas-controls-panel">
          <button id="btn-tree-zoom-in" title="Zoom In"><i data-lucide="plus"></i></button>
          <button id="btn-tree-zoom-out" title="Zoom Out"><i data-lucide="minus"></i></button>
          <button id="btn-tree-zoom-reset" title="Recenter View"><i data-lucide="minimize-2"></i></button>
          <button id="btn-tree-add-category" class="btn-primary" style="padding: 6px 12px; height: 32px; font-size: 11px; margin-left: 8px;">
            <i data-lucide="plus-circle"></i> Add Skill
          </button>
        </div>

        <!-- Legend -->
        <div class="legend-panel">
          <div class="legend-item">
            <div class="legend-dot" style="background-color: var(--neon-cyan);"></div>
            <span>Main Goal Node</span>
          </div>
          <div class="legend-item">
            <div class="legend-dot" style="background-color: var(--neon-purple);"></div>
            <span>Active Skill Node</span>
          </div>
          <div class="legend-item">
            <div class="legend-dot" style="border: 1px dashed var(--text-muted); background: transparent;"></div>
            <span>Drag Nodes to Arrange</span>
          </div>
        </div>

        <!-- Interactive Viewport -->
        <div id="tree-canvas-viewport">
          <svg id="tree-svg">
            <defs>
              <!-- Glowing Filters -->
              <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-purple" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <g id="tree-content-group">
              <g id="paths-group"></g>
              <g id="nodes-group"></g>
            </g>
          </svg>
        </div>

        <!-- Node Detail Side Drawer -->
        <div id="node-detail-drawer">
          <div class="drawer-header">
            <h3 id="drawer-title">Skill Category Details</h3>
            <button class="btn-close-drawer" id="btn-tree-close-drawer">
              <i data-lucide="x"></i>
            </button>
          </div>
          <div class="drawer-body custom-scroll">
            <!-- Dynamic Drawer Content -->
          </div>
        </div>
      </div>
    `;

    // Center layout coordinates on initial render
    const viewport = this.container.querySelector('#tree-canvas-viewport');
    setTimeout(() => {
      if (viewport) {
        this.dx = viewport.clientWidth / 2;
        this.dy = viewport.clientHeight / 2;
        this.scale = 1;
        this.updateTransform();
        this.drawTree();
      }
    }, 50);

    lucide.createIcons();
    this.initCanvasListeners();
  },

  updateTransform() {
    const group = this.container.querySelector('#tree-content-group');
    if (group) {
      group.setAttribute('transform', `translate(${this.dx}, ${this.dy}) scale(${this.scale})`);
    }
  },

  drawTree() {
    const activeGoalId = db.getActiveGoalId();
    const goals = db.getGoals();
    const activeGoal = goals.find(g => g.id === activeGoalId);
    if (!activeGoal) return;

    const categories = db.getCategories(activeGoalId);
    const pathsGroup = this.container.querySelector('#paths-group');
    const nodesGroup = this.container.querySelector('#nodes-group');

    if (!pathsGroup || !nodesGroup) return;

    pathsGroup.innerHTML = '';
    nodesGroup.innerHTML = '';

    // 1. Calculate Positions
    const centerX = 0;
    const centerY = 0;

    const computedCoords = {};
    const R = 220; // Radius for circular layout if no saved position

    categories.forEach((cat, idx) => {
      if (this.nodeCoords[cat.id]) {
        computedCoords[cat.id] = this.nodeCoords[cat.id];
      } else {
        // Calculate default ring positions
        const angle = (2 * Math.PI * idx) / categories.length - Math.PI / 2;
        computedCoords[cat.id] = {
          x: Math.round(R * Math.cos(angle)),
          y: Math.round(R * Math.sin(angle))
        };
        // Persist default coordinate
        this.nodeCoords[cat.id] = computedCoords[cat.id];
      }
    });
    
    // Save coordinate updates
    localStorage.setItem(`ascend_coords_${activeGoalId}`, JSON.stringify(this.nodeCoords));

    // 2. Draw Connection Paths
    categories.forEach(cat => {
      const pos = computedCoords[cat.id];
      if (!pos) return;

      const progress = cat.progress_score || 0;
      const isCompleted = progress >= 100;
      
      // Connection path lines
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', `M ${centerX} ${centerY} L ${pos.x} ${pos.y}`);
      pathEl.setAttribute('class', `connection-path ${progress > 0 ? 'active' : ''}`);
      
      // Calculate dynamic color/strength based on completion percentage
      const strokeColor = progress > 0 ? cat.color : '#2d3748';
      const strokeWidth = 2 + (progress / 100) * 3;
      
      pathEl.setAttribute('stroke', strokeColor);
      pathEl.setAttribute('stroke-width', `${strokeWidth}px`);
      
      if (progress > 0) {
        // Add SVG shadow filters for glowing active connections
        pathEl.setAttribute('style', `filter: drop-shadow(0 0 ${2 + (progress/100)*6}px ${cat.color}aa)`);
      }

      pathsGroup.appendChild(pathEl);
    });

    // 3. Draw Main Goal Node
    const mainNodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    mainNodeG.setAttribute('class', 'node-group');
    mainNodeG.setAttribute('transform', `translate(${centerX}, ${centerY})`);
    
    // Main Goal Glow
    const mainGlow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    mainGlow.setAttribute('r', '52');
    mainGlow.setAttribute('fill', 'var(--neon-cyan)');
    mainGlow.setAttribute('opacity', '0.15');
    mainGlow.setAttribute('filter', 'url(#glow-cyan)');
    mainNodeG.appendChild(mainGlow);

    // Main Goal Outer Ring
    const mainOuter = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    mainOuter.setAttribute('r', '42');
    mainOuter.setAttribute('fill', '#070a13');
    mainOuter.setAttribute('stroke', 'var(--neon-cyan)');
    mainOuter.setAttribute('stroke-width', '3');
    mainNodeG.appendChild(mainOuter);

    // Main Goal Icon/Text
    const mainText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    mainText.setAttribute('class', 'node-text-main');
    mainText.setAttribute('y', '4');
    mainText.textContent = activeGoal.title.length > 12 ? activeGoal.title.substring(0, 10) + '...' : activeGoal.title;
    mainNodeG.appendChild(mainText);

    nodesGroup.appendChild(mainNodeG);

    // 4. Draw Category Nodes
    categories.forEach(cat => {
      const pos = computedCoords[cat.id];
      if (!pos) return;

      const progress = cat.progress_score || 0;

      const catNodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      catNodeG.setAttribute('class', 'node-group category-node');
      catNodeG.setAttribute('data-id', cat.id);
      catNodeG.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

      // Glow Ring
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      glow.setAttribute('class', 'node-glow');
      glow.setAttribute('r', '42');
      glow.setAttribute('fill', cat.color);
      glow.setAttribute('opacity', '0.15');
      glow.setAttribute('style', `filter: drop-shadow(0 0 10px ${cat.color}80)`);
      catNodeG.appendChild(glow);

      // Outer Ring
      const outer = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      outer.setAttribute('class', 'node-circle');
      outer.setAttribute('r', '32');
      outer.setAttribute('fill', '#070a13');
      outer.setAttribute('stroke', progress > 0 ? cat.color : 'var(--text-muted)');
      outer.setAttribute('stroke-width', '2.5');
      
      if (progress > 0) {
        outer.setAttribute('style', `filter: drop-shadow(0 0 8px ${cat.color}40)`);
      }
      catNodeG.appendChild(outer);

      // Segmented Circular Progress Indicator inside node
      if (progress > 0) {
        const progressArc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        progressArc.setAttribute('r', '27');
        progressArc.setAttribute('fill', 'none');
        progressArc.setAttribute('stroke', cat.color);
        progressArc.setAttribute('stroke-width', '2');
        
        // Calculate circumference
        const circ = 2 * Math.PI * 27;
        progressArc.setAttribute('stroke-dasharray', circ);
        progressArc.setAttribute('stroke-dashoffset', circ - (progress / 100) * circ);
        progressArc.setAttribute('transform', 'rotate(-90)');
        catNodeG.appendChild(progressArc);
      }

      // Title text inside node
      const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      nameText.setAttribute('class', 'node-text-main');
      nameText.setAttribute('y', '-2');
      nameText.textContent = cat.title.length > 10 ? cat.title.substring(0, 8) + '..' : cat.title;
      catNodeG.appendChild(nameText);

      // Progress text inside node
      const scoreText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      scoreText.setAttribute('class', 'node-text-sub');
      scoreText.setAttribute('y', '12');
      scoreText.textContent = `${progress}%`;
      catNodeG.appendChild(scoreText);

      nodesGroup.appendChild(catNodeG);

      // Node Drag Listeners
      catNodeG.addEventListener('mousedown', (e) => {
        // Prevent pan behavior
        e.stopPropagation();
        
        // Check if user is clicking to open drawer or actually dragging
        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        let hasMoved = false;

        this.isDraggingNode = true;
        this.draggedNodeId = cat.id;
        this.dragNodeStartX = e.clientX;
        this.dragNodeStartY = e.clientY;

        const handleNodeMouseMove = (mvEvent) => {
          if (!this.isDraggingNode) return;
          const dxMouse = mvEvent.clientX - startMouseX;
          const dyMouse = mvEvent.clientY - startMouseY;
          if (Math.abs(dxMouse) > 3 || Math.abs(dyMouse) > 3) {
            hasMoved = true;
          }

          // Convert screen drag delta to SVG coordinate space
          const deltaX = (mvEvent.clientX - this.dragNodeStartX) / this.scale;
          const deltaY = (mvEvent.clientY - this.dragNodeStartY) / this.scale;

          const nodePos = this.nodeCoords[cat.id];
          nodePos.x += deltaX;
          nodePos.y += deltaY;

          this.dragNodeStartX = mvEvent.clientX;
          this.dragNodeStartY = mvEvent.clientY;

          this.drawTree();
        };

        const handleNodeMouseUp = () => {
          this.isDraggingNode = false;
          window.removeEventListener('mousemove', handleNodeMouseMove);
          window.removeEventListener('mouseup', handleNodeMouseUp);

          if (!hasMoved) {
            // It was a click! Open detail drawer.
            this.openNodeDrawer(cat.id);
          } else {
            // It was a drag. Persist coordinate changes.
            localStorage.setItem(`ascend_coords_${activeGoalId}`, JSON.stringify(this.nodeCoords));
          }
        };

        window.addEventListener('mousemove', handleNodeMouseMove);
        window.addEventListener('mouseup', handleNodeMouseUp);
      });
    });
  },

  openNodeDrawer(catId) {
    this.selectedNodeId = catId;
    const activeGoalId = db.getActiveGoalId();
    const categories = db.getCategories(activeGoalId);
    const category = categories.find(c => c.id === catId);
    if (!category) return;

    const drawer = this.container.querySelector('#node-detail-drawer');
    const drawerTitle = this.container.querySelector('#drawer-title');
    const drawerBody = this.container.querySelector('.drawer-body');

    drawerTitle.textContent = category.title.toUpperCase();
    drawerTitle.style.color = category.color;
    
    // Draw the internal layout of drawer (adding / listing habits)
    this.renderDrawerBody(category, drawerBody);

    drawer.classList.add('open');
  },

  renderDrawerBody(category, bodyContainer) {
    const habits = db.getHabits(category.id);

    bodyContainer.innerHTML = `
      <!-- Category Edit Form -->
      <div class="glass-panel" style="padding: 16px; border-color: ${category.color}33;">
        <h4 style="margin-bottom: 12px; font-size: 13px; font-family: var(--font-display); color: var(--text-secondary);">RENAME & COLOR</h4>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div class="form-group">
            <input type="text" id="edit-cat-title-input" value="${category.title}">
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <label style="font-size: 12px; color: var(--text-secondary);">Core Accent Color</label>
            <div style="display: flex; gap: 8px;">
              ${['#00f2fe', '#9d4edd', '#00f5a0', '#ff9f1c', '#ff3366'].map(col => `
                <div class="color-picker-dot ${category.color === col ? 'active' : ''}" 
                     style="background-color: col; background: ${col}; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; border: 2px solid ${category.color === col ? 'white' : 'transparent'}; box-shadow: 0 0 6px ${col}60;"
                     data-color="${col}"></div>
              `).join('')}
            </div>
          </div>
          <button class="btn-secondary" id="btn-save-cat-details" style="justify-content: center; font-size: 11px; padding: 6px 12px; margin-top: 4px;">Update Details</button>
        </div>
      </div>

      <!-- Add Habit Form -->
      <div class="glass-panel" style="padding: 16px;">
        <h4 style="margin-bottom: 12px; font-size: 13px; font-family: var(--font-display); color: var(--text-secondary);">CREATE ACTION NODE</h4>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div class="form-group">
            <label for="habit-title-input">Action / Habit Name</label>
            <input type="text" id="habit-title-input" placeholder="e.g. 200 throws, watch film, sprint run">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="form-group">
              <label for="habit-freq-select">Frequency</label>
              <select id="habit-freq-select">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div class="form-group">
              <label for="habit-type-select">Log Type</label>
              <select id="habit-type-select">
                <option value="binary">Checkbox (Pass/Fail)</option>
                <option value="number">Quantity Metric</option>
              </select>
            </div>
          </div>

          <!-- Quantity Metric Fields (hidden by default if binary) -->
          <div id="quantity-metric-inputs" style="display: none; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="form-group">
              <label for="habit-target-input">Target Value</label>
              <input type="text" id="habit-target-input" value="100">
            </div>
            <div class="form-group">
              <label for="habit-unit-input">Unit</label>
              <input type="text" id="habit-unit-input" placeholder="throws, mins, reps" value="reps">
            </div>
          </div>

          <button class="btn-primary" id="btn-drawer-add-habit" style="justify-content: center; font-size: 11px; padding: 8px 12px;">
            <i data-lucide="plus"></i> Add Subgoal Action
          </button>
        </div>
      </div>

      <!-- Existing Habits Checklist -->
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <h4 style="font-size: 13px; font-family: var(--font-display); color: var(--text-secondary);">ACTIVE ACTION NODES</h4>
        
        ${habits.length === 0 ? `
          <p style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 12px;">No actions configured yet.</p>
        ` : habits.map(h => `
          <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-darker); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 10px 14px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-weight: 600; font-size: 13px;">${h.title}</span>
              <span style="font-size: 10px; color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
                <span>🔁 ${h.frequency}</span>
                <span>🎯 ${h.metric_type === 'binary' ? 'Check off' : `${h.target_value} ${h.unit}`}</span>
                ${h.streak > 0 ? `<span style="color: var(--neon-amber);">🔥 ${h.streak}d</span>` : ''}
              </span>
            </div>
            <button class="ai-trash-btn btn-delete-habit" data-habit-id="${h.id}">
              <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            </button>
          </div>
        `).join('')}
      </div>

      <!-- Delete category button -->
      <button class="btn-secondary" id="btn-delete-category" style="margin-top: 10px; border-color: rgba(255, 51, 102, 0.3); color: var(--neon-red); justify-content: center; font-size: 11px; padding: 8px 12px;">
        <i data-lucide="trash-2"></i> Delete Skill Category
      </button>
    `;

    lucide.createIcons({ attrs: { style: 'width: 14px; height: 14px;' } });
    this.initDrawerListeners(category, bodyContainer);
  },

  initCanvasListeners() {
    const handleSound = () => {
      window.dispatchEvent(new CustomEvent('play-sound', { detail: { type: 'click' } }));
    };

    const viewport = this.container.querySelector('#tree-canvas-viewport');
    const svg = this.container.querySelector('#tree-svg');

    // Pan & Zoom mouse events
    viewport.addEventListener('mousedown', (e) => {
      // Ignore right clicks or clicks on nodes
      if (e.button !== 0) return;
      this.isPanning = true;
      this.panStartX = e.clientX - this.dx;
      this.panStartY = e.clientY - this.dy;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      this.dx = e.clientX - this.panStartX;
      this.dy = e.clientY - this.panStartY;
      this.updateTransform();
    });

    window.addEventListener('mouseup', () => {
      this.isPanning = false;
    });

    // Zoom on wheel scroll (cursor-centered)
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Translate coordinates to SVG space relative to group origin
      const svgX = (mouseX - this.dx) / this.scale;
      const svgY = (mouseY - this.dy) / this.scale;

      const scaleFactor = e.deltaY < 0 ? 1.08 : 0.925;
      const newScale = this.scale * scaleFactor;
      this.scale = Math.max(0.4, Math.min(2.5, newScale));

      // Re-adjust pan coordinates to keep target cursor stable
      this.dx = mouseX - svgX * this.scale;
      this.dy = mouseY - svgY * this.scale;

      this.updateTransform();
    }, { passive: false });

    // Buttons zoom listeners
    this.container.querySelector('#btn-tree-zoom-in').addEventListener('click', () => {
      handleSound();
      this.scale = Math.min(2.5, this.scale * 1.25);
      this.updateTransform();
    });

    this.container.querySelector('#btn-tree-zoom-out').addEventListener('click', () => {
      handleSound();
      this.scale = Math.max(0.4, this.scale * 0.8);
      this.updateTransform();
    });

    this.container.querySelector('#btn-tree-zoom-reset').addEventListener('click', () => {
      handleSound();
      this.dx = viewport.clientWidth / 2;
      this.dy = viewport.clientHeight / 2;
      this.scale = 1;
      this.updateTransform();
    });

    // Drawer close buttons
    this.container.querySelector('#btn-tree-close-drawer').addEventListener('click', () => {
      handleSound();
      this.container.querySelector('#node-detail-drawer').classList.remove('open');
    });

    // Add Category button
    this.container.querySelector('#btn-tree-add-category').addEventListener('click', () => {
      handleSound();
      const catName = prompt("Enter new Skill Category name:");
      if (!catName || !catName.trim()) return;

      const colors = ['#00f2fe', '#9d4edd', '#00f5a0', '#ff9f1c', '#ff3366'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      const activeGoalId = db.getActiveGoalId();
      db.addCategory(activeGoalId, catName.trim(), randomColor);
      db.checkAchievements();
      this.drawTree();
      triggerToast(`Category "${catName.trim()}" added to tree!`, 'success');
    });
  },

  initDrawerListeners(category, bodyContainer) {
    const handleSound = () => {
      window.dispatchEvent(new CustomEvent('play-sound', { detail: { type: 'click' } }));
    };

    // Color picker Selection
    const colorPickerDots = bodyContainer.querySelectorAll('.color-picker-dot');
    let selectedColor = category.color;
    
    colorPickerDots.forEach(dot => {
      dot.addEventListener('click', () => {
        handleSound();
        colorPickerDots.forEach(d => {
          d.style.borderColor = 'transparent';
          d.classList.remove('active');
        });
        dot.style.borderColor = 'white';
        dot.classList.add('active');
        selectedColor = dot.getAttribute('data-color');
      });
    });

    // Save Category color / name
    const updateDetailsBtn = bodyContainer.querySelector('#btn-save-cat-details');
    updateDetailsBtn.addEventListener('click', () => {
      handleSound();
      const titleInput = bodyContainer.querySelector('#edit-cat-title-input');
      const newTitle = titleInput.value.trim();
      if (!newTitle) {
        triggerToast('Skill category title cannot be empty.', 'error');
        return;
      }

      const allCats = db.getAllCategories();
      const catIndex = allCats.findIndex(c => c.id === category.id);
      if (catIndex !== -1) {
        allCats[catIndex].title = newTitle;
        allCats[catIndex].color = selectedColor;
        localStorage.setItem('ascend_categories', JSON.stringify(allCats));
        
        // Redraw tree
        this.drawTree();
        
        // Refresh drawer header
        const drawerTitle = this.container.querySelector('#drawer-title');
        drawerTitle.textContent = newTitle.toUpperCase();
        drawerTitle.style.color = selectedColor;

        triggerToast('Skill category details updated.', 'success');
      }
    });

    // Toggle Habit Log Type selects metric fields
    const habitTypeSelect = bodyContainer.querySelector('#habit-type-select');
    const metricInputsWrap = bodyContainer.querySelector('#quantity-metric-inputs');
    habitTypeSelect.addEventListener('change', () => {
      metricInputsWrap.style.display = habitTypeSelect.value === 'number' ? 'grid' : 'none';
    });

    // Add Habit Button
    const addHabitBtn = bodyContainer.querySelector('#btn-drawer-add-habit');
    addHabitBtn.addEventListener('click', () => {
      handleSound();
      const habitTitle = bodyContainer.querySelector('#habit-title-input').value.trim();
      const frequency = bodyContainer.querySelector('#habit-freq-select').value;
      const type = habitTypeSelect.value;
      
      if (!habitTitle) {
        triggerToast('Please name your subgoal action.', 'error');
        return;
      }

      let targetVal = 1;
      let unit = 'sessions';

      if (type === 'number') {
        const valInput = bodyContainer.querySelector('#habit-target-input').value;
        const unitInput = bodyContainer.querySelector('#habit-unit-input').value.trim();
        targetVal = Number(valInput);
        if (isNaN(targetVal) || targetVal <= 0) {
          triggerToast('Please provide a valid target count.', 'error');
          return;
        }
        unit = unitInput || 'reps';
      } else {
        unit = frequency === 'daily' ? 'done' : 'done';
      }

      db.addHabit(category.id, habitTitle, frequency, type, targetVal, unit);
      db.checkAchievements();
      this.drawTree();
      this.openNodeDrawer(category.id); // Reload drawer contents
      triggerToast(`Added action: "${habitTitle}"`, 'success');
    });

    // Delete Habit Buttons
    const deleteHabitBtns = bodyContainer.querySelectorAll('.btn-delete-habit');
    deleteHabitBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        handleSound();
        const habitId = btn.getAttribute('data-habit-id');
        if (confirm("Delete this subgoal action? All completion histories for it will be lost.")) {
          db.deleteHabit(habitId);
          this.drawTree();
          this.openNodeDrawer(category.id); // Reload drawer contents
          triggerToast('Action node deleted.', 'info');
        }
      });
    });

    // Delete Category Button
    const deleteCatBtn = bodyContainer.querySelector('#btn-delete-category');
    deleteCatBtn.addEventListener('click', () => {
      handleSound();
      if (confirm(`Delete the skill category "${category.title}"? This will permanently delete all actions and streaks inside it!`)) {
        db.deleteCategory(category.id);
        
        // Remove from persistent coordinates
        delete this.nodeCoords[category.id];
        const activeGoalId = db.getActiveGoalId();
        localStorage.setItem(`ascend_coords_${activeGoalId}`, JSON.stringify(this.nodeCoords));

        this.drawTree();
        this.container.querySelector('#node-detail-drawer').classList.remove('open');
        triggerToast('Skill category deleted.', 'info');
      }
    });
  }
};
export default GoalTree;
