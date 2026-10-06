/* ==========================================================================
   ASCEND COMPONENT: PERFORMANCE ANALYTICS & RADAR BALANCE
   ========================================================================== */

import { db } from '../utils/db.js';

export const Analytics = {
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
    const logs = db.getAllLogs();

    // Determine strongest / weakest categories
    let strongest = 'N/A';
    let weakest = 'N/A';
    let highestScore = -1;
    let lowestScore = 101;

    categories.forEach(c => {
      const score = c.progress_score || 0;
      if (score > highestScore) {
        highestScore = score;
        strongest = c.title;
      }
      if (score < lowestScore) {
        lowestScore = score;
        weakest = c.title;
      }
    });

    if (categories.length === 0) {
      lowestScore = 0;
      highestScore = 0;
    }

    // Weekly consistency bars logic
    const weeklyData = this.calculateWeeklyConsistency(habits, logs);

    const content = `
      <div class="dashboard-layout fade-in">
        <!-- Screen Header -->
        <div class="screen-header">
          <div class="screen-title">
            <h1>PERFORMANCE METRICS</h1>
            <p>Consistency analysis for: ${activeGoal.title}</p>
          </div>
        </div>

        <!-- Analytics Grid Split -->
        <div class="analytics-grid">
          <!-- Left side: SVG Radar Balance chart -->
          <div class="glass-panel" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 380px;">
            <div class="panel-header" style="width: 100%;">
              <div class="panel-title">
                <i data-lucide="compass" style="color: var(--neon-cyan);"></i> Skill Balance Radar
              </div>
            </div>
            
            ${categories.length < 3 ? `
              <div class="empty-state" style="flex: 1;">
                <i data-lucide="compass" style="opacity: 0.1; font-size: 40px;"></i>
                <p>Radar chart requires at least 3 skill categories to construct a balance profile.</p>
              </div>
            ` : `
              <div class="radar-chart-container" style="flex: 1; width: 100%; display: flex; align-items: center; justify-content: center;">
                ${this.renderRadarChartSVG(categories)}
              </div>
            `}
            
            <div style="font-size: 11px; color: var(--text-secondary); text-align: center; margin-top: 12px; width: 80%;">
              Radar area indicates coverage balance. Keep nodes filled equally to avoid developmental gaps.
            </div>
          </div>

          <!-- Right side: Bar chart & Focus fields -->
          <div style="display: flex; flex-direction: column; gap: 24px;">
            <!-- Consistency Bars Card -->
            <div class="glass-panel" style="flex: 1;">
              <div class="panel-header">
                <div class="panel-title">
                  <i data-lucide="calendar" style="color: var(--neon-emerald);"></i> 7-Day Completion Rate
                </div>
              </div>

              <div class="consistency-grid">
                ${weeklyData.map(day => `
                  <div class="consistency-bar-wrap">
                    <div class="consistency-bar-track">
                      <div class="consistency-bar-fill" style="height: ${day.percentage}%; filter: drop-shadow(0 0 4px var(--neon-emerald-glow));"></div>
                    </div>
                    <span class="consistency-bar-label" title="${day.date}">${day.label}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Insight Panels -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
              <div class="glass-panel" style="padding: 16px;">
                <div style="font-size: 11px; color: var(--text-secondary); font-family: var(--font-display); text-transform: uppercase;">Primary Strength</div>
                <div style="font-size: 18px; font-weight: 700; color: var(--neon-cyan); margin-top: 6px; font-family: var(--font-display);">${strongest}</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Max coverage at ${highestScore}%</div>
              </div>

              <div class="glass-panel" style="padding: 16px;">
                <div style="font-size: 11px; color: var(--text-secondary); font-family: var(--font-display); text-transform: uppercase;">Underdeveloped Node</div>
                <div style="font-size: 18px; font-weight: 700; color: var(--neon-red); margin-top: 6px; font-family: var(--font-display);">${weakest}</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Attention needed at ${lowestScore}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = content;
    lucide.createIcons();
  },

  calculateWeeklyConsistency(habits, logs) {
    const list = [];
    const dailyHabits = habits.filter(h => h.frequency === 'daily');

    // Fetch details for last 7 days (including today)
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const completed = dailyHabits.filter(h => {
        const log = logs.find(l => l.habit_id === h.id && l.date === dateStr);
        return log && log.completion_value >= h.target_value;
      });

      const pct = dailyHabits.length > 0 ? Math.round((completed.length / dailyHabits.length) * 100) : 0;
      
      // Formatting label e.g. "Mon"
      const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayLabel = i === 0 ? 'Today' : labels[date.getDay()];

      list.push({
        label: dayLabel,
        date: dateStr,
        percentage: pct
      });
    }

    return list;
  },

  renderRadarChartSVG(categories) {
    const N = categories.length;
    const width = 280;
    const height = 280;
    const cx = width / 2;
    const cy = height / 2;
    const R = 95; // Max radius of outer ring

    const points = [];
    const polygonPoints = [];
    const labelPoints = [];

    categories.forEach((cat, idx) => {
      const angle = (2 * Math.PI * idx) / N - Math.PI / 2;
      const progress = cat.progress_score || 0;
      
      // 100% boundary coord
      const xMax = cx + R * Math.cos(angle);
      const yMax = cy + R * Math.sin(angle);
      points.push({ x: xMax, y: yMax });

      // Actual score coord
      const scoreR = (progress / 100) * R;
      const xScore = cx + scoreR * Math.cos(angle);
      const yScore = cy + scoreR * Math.sin(angle);
      polygonPoints.push(`${xScore},${yScore}`);

      // Label positioning slightly outer
      const labelR = R + 18;
      const xLabel = cx + labelR * Math.cos(angle);
      const yLabel = cy + labelR * Math.sin(angle) + 3; // vertical shift correction
      
      // text alignment helper
      let textAnchor = 'middle';
      if (Math.cos(angle) > 0.1) textAnchor = 'start';
      else if (Math.cos(angle) < -0.1) textAnchor = 'end';

      labelPoints.push({
        x: xLabel,
        y: yLabel,
        text: cat.title.length > 10 ? cat.title.substring(0, 8) + '..' : cat.title,
        color: cat.color,
        anchor: textAnchor
      });
    });

    // Draw grid concentric lines (concentric loops at 25%, 50%, 75%, 100%)
    const gridRings = [0.25, 0.50, 0.75, 1.00];
    const gridLinesHTML = gridRings.map(scale => {
      const ringPoints = categories.map((_, idx) => {
        const angle = (2 * Math.PI * idx) / N - Math.PI / 2;
        const rx = cx + (R * scale) * Math.cos(angle);
        const ry = cy + (R * scale) * Math.sin(angle);
        return `${rx},${ry}`;
      }).join(' ');
      return `<polygon class="radar-grid" points="${ringPoints}" />`;
    }).join('\n');

    // Draw spoke axes (center to outer corner)
    const axesHTML = points.map(p => `
      <line class="radar-axis" x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" />
    `).join('\n');

    // Draw the active value polygon area
    const polyHTML = `<polygon class="radar-polygon" points="${polygonPoints.join(' ')}" />`;

    // Draw labels text
    const labelsHTML = labelPoints.map(p => `
      <text class="radar-label" x="${p.x}" y="${p.y}" text-anchor="${p.anchor}" fill="${p.color}">${p.text}</text>
    `).join('\n');

    return `
      <svg class="radar-chart-svg" viewBox="0 0 ${width} ${height}">
        ${gridLinesHTML}
        ${axesHTML}
        ${polyHTML}
        <!-- Tiny dots on score intersections -->
        ${categories.map((cat, idx) => {
          const angle = (2 * Math.PI * idx) / N - Math.PI / 2;
          const scoreR = ((cat.progress_score || 0) / 100) * R;
          const x = cx + scoreR * Math.cos(angle);
          const y = cy + scoreR * Math.sin(angle);
          return `<circle cx="${x}" cy="${y}" r="3" fill="${cat.color}" />`;
        }).join('')}
        ${labelsHTML}
      </svg>
    `;
  }
};
export default Analytics;
