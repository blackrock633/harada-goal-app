# Ascend // Skill Tree & Goal Progression System

**Ascend** is an interactive, gamified goal-tracking single-page application (SPA) designed to help users break ambitious long-term goals into skill categories and daily actions. It utilizes a custom interactive SVG node-graph resembling an RPG skill tree to visualize progression.

---

## 🚀 Getting Started

The app is built as a zero-dependency, vanilla HTML5, CSS3, and ES6 JavaScript SPA. It runs immediately in modern web browsers.

### Start Local Development Server
To run the app locally with correct ES Module file loading, start a simple HTTP server using Python:

1. Open your terminal in this directory.
2. Execute the following command:
   ```bash
   python3 -m http.server 8000
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

---

## 🔮 Core System Architecture

- **`index.html`**: Root viewport grid layout, sidebar user level tracker, navigation controllers.
- **`index.css`**: Core design variables (neon cyan, purple, emerald, and amber theme glow states), glassmorphic panels, and CSS animations (floating nodes, path-flowing lines).
- **`src/app.js`**: Core coordinate hub, router, event listeners, and data backup utility manager.
- **`src/utils/db.js`**: Reactive local-storage engine handling CRUD storage for goals, skills, habit checklists, completions, streaks, and user XP calculations.
- **`src/utils/audio.js`**: Web Audio API synthesizer creating retro synth-wave audio notifications (beeps, chord sweeps, and arpeggios on level ups) dynamically without external audio assets.
- **`src/components/`**:
  - **`Onboarding.js`**: Goal setup guide prompting templates (Soccer, Ultimate Frisbee, Startup) or routing to AI builder.
  - **`Dashboard.js`**: Core stats panel displaying level progressions, active achievements list, and timeline feeds.
  - **`GoalTree.js`**: Interactive SVG node-canvas featuring custom cursor-centered scroll zooming, background click dragging, and category node repositioning.
  - **`DailyTracker.js`**: Checklist of habits due today with pass/fail selectors, quantity metric logging inputs, and hot streaks indicators.
  - **`AIAssistant.js`**: Chat interface with fallback template responses and a live Google Gemini API content generator integration.
  - **`Analytics.js`**: Custom SVG radar chart showcasing developmental skill balances and weekly completion consistency graphs.

---

## 🎮 Gamification & Progression Mechanics

1. **XP & Levels**: Completing habits awards base XP (10-15 XP). Collecting XP advances your User Level (`LVL`), unlocking new Rank badges (Initiate ➔ Apprentice ➔ Contender ➔ Challenger ➔ Elite ➔ Master ➔ Grandmaster).
2. **Streak Bonusses**: Maintaining habit streaks of 5+ days awards scaling XP multipliers.
3. **Achievements**: Completing key activities (creating nodes, logging completions, keeping streaks) unlocks system achievements with a 50 XP bonus.
4. **Dynamic SVG Connections**: Connection lines from the central goal to skill categories will grow, thicken, and glow brighter as the category progress percentage increases.
5. **Interactive Nodes**: You can grab, drag, and reposition skill nodes in the Tree View to custom layout preferences. Positions are saved and persist automatically.
6. **Data Backups**: The bottom controls in the sidebar let you export all goal trees and history as a JSON file, or restore a backup file to keep sync across devices.
