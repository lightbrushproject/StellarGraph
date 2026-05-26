const { ItemView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } = require("obsidian");

const VIEW_TYPE = "stellar-graph-view";
const TWO_PI = Math.PI * 2;

const TYPE_STYLES = {
  agent: { label: "Agents", color: "#54d7ff", hot: true },
  skill: { label: "Skills", color: "#ffb86b", hot: true },
  source: { label: "Sources", color: "#9ba8ff", provenance: true },
  briefing: { label: "Briefings", color: "#ffffff", hot: true, provenance: true },
  decision: { label: "Decisions", color: "#ff7c91", hot: true, provenance: true },
  entity: { label: "Entities", color: "#ff8fb1", provenance: true },
  concept: { label: "Concepts", color: "#ffe477" },
  project: { label: "Projects", color: "#7dffb2" },
  system: { label: "Systems", color: "#c5a3ff" },
  github: { label: "GitHub", color: "#4ac7a8" },
  log: { label: "Logs", color: "#b8c7d9", provenance: true },
  note: { label: "Notes", color: "#d8e7f2" }
};

const THEMES = {
  night: {
    label: "Night",
    bg: ["#172635", "#080d13", "#020307"],
    accent: "#7fd7ff",
    accent2: "#a1ffd6",
    link: [127, 215, 255],
    panel: "dark",
    grid: "orbit"
  },
  sunset: {
    label: "Sunset",
    bg: ["#ff8a1f", "#b0187a", "#19003f"],
    accent: "#ff9a24",
    accent2: "#f83cff",
    link: [255, 138, 31],
    panel: "warm",
    grid: "orbit"
  },
  pixelwave: {
    label: "Pixelwave",
    bg: ["#21104a", "#07133a", "#02040e"],
    accent: "#ff4fd8",
    accent2: "#35f7ff",
    link: [53, 247, 255],
    panel: "neon",
    grid: "pixel"
  },
  win31: {
    label: "Win 3.1",
    bg: ["#d4d0c8", "#000080", "#000040"],
    accent: "#000080",
    accent2: "#ffff00",
    link: [0, 0, 128],
    panel: "win31",
    grid: "windows"
  },
  xp: {
    label: "XP Field",
    bg: ["#6ec8ff", "#1d79de", "#0b4f26"],
    accent: "#1d5fd1",
    accent2: "#f7ef70",
    link: [29, 95, 209],
    panel: "xp",
    grid: "horizon"
  }
};

const DEFAULT_STATE = {
  paused: false,
  labels: true,
  agentic: true,
  focus: true,
  mode: "all",
  theme: "night",
  query: "",
  speed: 1,
  zoom: 1,
  labelSize: 16,
  jumpType: "all",
  pitch: -0.28,
  yaw: 0
};

const TYPE_ORDER = Object.keys(TYPE_STYLES);

const DEFAULT_SETTINGS = {
  brandName: "Stellar Graph",
  defaultTheme: "night",
  defaultMode: "all",
  showWizardForSparseVaults: true,
  reducedMotion: false,
  renderBudgetMode: "auto",
  maxVisibleNodes: 1500
};

module.exports = class StellarGraphPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.settings.reducedMotion = true;
    }
    this.registerView(VIEW_TYPE, (leaf) => new StellarGraphView(leaf, this));
    this.addSettingTab(new StellarGraphSettingTab(this.app, this));

    this.addRibbonIcon("orbit", "Open Stellar Graph", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-stellar-graph",
      name: "Open Stellar Graph",
      callback: () => this.activateView()
    });

    this.refreshDebounce = debounce(() => this.refreshViews(), 1000);
    const refresh = this.refreshDebounce;
    this.registerEvent(this.app.metadataCache.on("changed", refresh));
    this.registerEvent(this.app.metadataCache.on("resolved", refresh));
    this.registerEvent(this.app.vault.on("create", refresh));
    this.registerEvent(this.app.vault.on("rename", refresh));
    this.registerEvent(this.app.vault.on("delete", refresh));
  }

  async onunload() {
    if (this.refreshDebounce && this.refreshDebounce.cancel) this.refreshDebounce.cancel();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async activateView(focus = true) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("split");
      await leaf.setViewState({ type: VIEW_TYPE, active: focus });
    }
    if (focus) this.app.workspace.revealLeaf(leaf);
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view && typeof leaf.view.refresh === "function") leaf.view.refresh();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshViews();
  }
};

class StellarGraphView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.nodes = [];
    this.links = [];
    this.visibleNodes = [];
    this.visibleLinks = [];
    this.renderNodes = [];
    this.renderLinks = [];
    this.focusNode = null;
    this.focusNeighbors = null;
    this.hovered = null;
    this.selected = null;
    this.pointer = { x: -9999, y: -9999 };
    this.drag = null;
    this.frame = 0;
    this.resizeObserver = null;
    this.jumpIndex = 0;
    this.state = {
      ...DEFAULT_STATE,
      mode: plugin.settings.defaultMode || DEFAULT_STATE.mode,
      theme: plugin.settings.defaultTheme || DEFAULT_STATE.theme
    };
    this.state.paused = Boolean(plugin.settings.reducedMotion);
    this.onMouseMove = this.handleMouseMove.bind(this);
    this.onMouseDown = this.handleMouseDown.bind(this);
    this.onMouseUp = this.handleMouseUp.bind(this);
    this.onMouseLeave = this.handleMouseLeave.bind(this);
    this.onWheel = this.handleWheel.bind(this);
    this.onClick = this.handleClick.bind(this);
    this.onKeyDown = this.handleKeyDown.bind(this);
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "Stellar Graph";
  }

  getIcon() {
    return "orbit";
  }

  async onOpen() {
    this.containerEl.addClass("stellar-graph-view");
    this.contentEl.empty();

    this.shell = this.contentEl.createDiv({ cls: "stellar-shell" });
    this.canvas = this.shell.createEl("canvas", {
      cls: "stellar-canvas",
      attr: {
        "aria-label": "3D graph canvas. Use arrow keys to rotate, plus and minus to zoom, bracket keys to step nodes, and Enter to open the selected node.",
        tabindex: "0"
      }
    });
    this.controls = this.shell.createDiv({ cls: "stellar-controls" });
    this.details = this.shell.createDiv({ cls: "stellar-details" });
    this.list = this.shell.createEl("div", { cls: "stellar-node-list", attr: { role: "list", "aria-label": "Important graph nodes" } });
    this.wizard = this.shell.createDiv({ cls: "stellar-wizard" });

    this.buildControls();
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("mouseleave", this.onMouseLeave);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("click", this.onClick);
    this.canvas.addEventListener("keydown", this.onKeyDown);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.shell);
    this.refresh();
    this.animate();
  }

  async onClose() {
    cancelAnimationFrame(this.frame);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.canvas) {
      this.canvas.removeEventListener("mousemove", this.onMouseMove);
      this.canvas.removeEventListener("mousedown", this.onMouseDown);
      this.canvas.removeEventListener("mouseleave", this.onMouseLeave);
      this.canvas.removeEventListener("wheel", this.onWheel);
      this.canvas.removeEventListener("click", this.onClick);
      this.canvas.removeEventListener("keydown", this.onKeyDown);
    }
    window.removeEventListener("mouseup", this.onMouseUp);
  }

  buildControls() {
    this.controls.empty();
    this.controls.createDiv({ cls: "stellar-brand", text: this.plugin.settings.brandName || "Stellar Graph" });
    this.stats = this.controls.createDiv({ cls: "stellar-stats", text: "Indexing vault..." });

    const search = this.controls.createEl("input", {
      cls: "stellar-search",
      attr: { type: "search", placeholder: "Search notes, agents, sources...", "aria-label": "Search graph notes" }
    });
    search.addEventListener("input", () => {
      this.state.query = search.value.trim().toLowerCase();
      this.applyFilters();
    });

    const row = this.controls.createDiv({ cls: "stellar-control-row" });
    this.mode = row.createEl("select", { cls: "stellar-select", attr: { "aria-label": "Graph mode" } });
    [
      ["all", "All"],
      ["agentic", "Agentic"],
      ["provenance", "Provenance"],
      ["recent", "Recent"]
    ].forEach(([value, label]) => {
      this.mode.createEl("option", { value, text: label });
    });
    this.mode.value = this.state.mode;
    this.mode.addEventListener("change", () => {
      this.state.mode = this.mode.value;
      this.applyFilters();
    });

    this.theme = row.createEl("select", { cls: "stellar-select", attr: { "aria-label": "Theme" } });
    Object.keys(THEMES).forEach((key) => {
      this.theme.createEl("option", { value: key, text: THEMES[key].label });
    });
    this.theme.value = this.state.theme;
    this.theme.addEventListener("change", () => {
      this.state.theme = this.theme.value;
      this.applyTheme();
    });

    this.pauseButton = makeButton(row, this.state.paused ? "Play" : "Pause", () => {
      this.state.paused = !this.state.paused;
      this.pauseButton.setText(this.state.paused ? "Play" : "Pause");
      this.pauseButton.setAttribute("aria-pressed", String(this.state.paused));
      if (this.state.paused && this.frame) {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.draw();
      } else if (!this.frame) {
        this.animate();
      }
    });
    makeButton(row, "Reset", () => {
      this.state.yaw = 0;
      this.state.pitch = DEFAULT_STATE.pitch;
      this.state.zoom = 1;
      this.selected = null;
      this.updateDetails();
      this.invalidate();
    });

    const row2 = this.controls.createDiv({ cls: "stellar-control-row" });
    this.labelsButton = makeButton(row2, "Labels On", () => {
      this.state.labels = !this.state.labels;
      this.labelsButton.setText(this.state.labels ? "Labels On" : "Labels Off");
      this.labelsButton.setAttribute("aria-pressed", String(this.state.labels));
      this.invalidate();
    });
    this.agenticButton = makeButton(row2, "Agentic On", () => {
      this.state.agentic = !this.state.agentic;
      this.agenticButton.setText(this.state.agentic ? "Agentic On" : "Agentic Off");
      this.agenticButton.setAttribute("aria-pressed", String(this.state.agentic));
      this.invalidate();
    });
    this.focusButton = makeButton(row2, "Focus On", () => {
      this.state.focus = !this.state.focus;
      this.focusButton.setText(this.state.focus ? "Focus On" : "Focus Off");
      this.focusButton.setAttribute("aria-pressed", String(this.state.focus));
      this.invalidate();
    });
    this.pauseButton.setAttribute("aria-pressed", String(this.state.paused));
    this.labelsButton.setAttribute("aria-pressed", String(this.state.labels));
    this.agenticButton.setAttribute("aria-pressed", String(this.state.agentic));
    this.focusButton.setAttribute("aria-pressed", String(this.state.focus));

    const jumpRow = this.controls.createDiv({ cls: "stellar-control-row" });
    this.jump = jumpRow.createEl("select", { cls: "stellar-select", attr: { "aria-label": "Jump to group" } });
    [["all", "Jump: Any"]].concat(Object.keys(TYPE_STYLES).map((key) => [key, TYPE_STYLES[key].label])).forEach(([value, label]) => {
      this.jump.createEl("option", { value, text: label });
    });
    this.jump.addEventListener("change", () => {
      this.state.jumpType = this.jump.value;
      this.jumpIndex = 0;
      this.jumpToGroup();
    });
    makeButton(jumpRow, "Prev", () => this.stepJump(-1));
    makeButton(jumpRow, "Next", () => this.stepJump(1));

    const zoomRow = this.controls.createDiv({ cls: "stellar-control-row" });
    makeButton(zoomRow, "Zoom -", () => {
      this.state.zoom = clamp(this.state.zoom - 0.28, 0.28, 5);
      this.invalidate();
    });
    makeButton(zoomRow, "Zoom +", () => {
      this.state.zoom = clamp(this.state.zoom + 0.28, 0.28, 5);
      this.invalidate();
    });
    makeButton(zoomRow, "Text +", () => {
      this.state.labelSize = clamp(this.state.labelSize + 1, 11, 26);
      this.invalidate();
    });
    makeButton(zoomRow, "Text -", () => {
      this.state.labelSize = clamp(this.state.labelSize - 1, 11, 26);
      this.invalidate();
    });

    const speedWrap = this.controls.createDiv({ cls: "stellar-slider" });
    const speedLabel = speedWrap.createEl("span", { text: "Speed" });
    const speed = speedWrap.createEl("input", {
      attr: {
        type: "range",
        min: "0",
        max: "2.4",
        step: "0.1",
        value: String(this.state.speed),
        "aria-label": "Graph rotation speed",
        "aria-valuetext": `${this.state.speed}x`
      }
    });
    speed.addEventListener("input", () => {
      this.state.speed = Number(speed.value);
      speed.setAttribute("aria-valuetext", `${this.state.speed}x`);
    });
    speedLabel.addClass("stellar-slider-label");

    const budgetRow = this.controls.createDiv({ cls: "stellar-control-row" });
    const budgetMode = budgetRow.createEl("select", { cls: "stellar-select", attr: { "aria-label": "Render budget mode" } });
    budgetMode.createEl("option", { value: "auto", text: `Auto ${resolveRenderBudget({ ...this.plugin.settings, renderBudgetMode: "auto" })}` });
    budgetMode.createEl("option", { value: "manual", text: "Manual" });
    budgetMode.value = this.plugin.settings.renderBudgetMode || DEFAULT_SETTINGS.renderBudgetMode;
    const budgetInput = budgetRow.createEl("input", {
      cls: "stellar-budget-input",
      attr: {
        type: "number",
        min: "100",
        max: "50000",
        step: "100",
        value: String(this.plugin.settings.maxVisibleNodes),
        "aria-label": "Manual maximum visible nodes"
      }
    });
    budgetInput.disabled = budgetMode.value !== "manual";
    budgetMode.addEventListener("change", async () => {
      this.plugin.settings.renderBudgetMode = budgetMode.value;
      budgetInput.disabled = budgetMode.value !== "manual";
      await this.plugin.saveSettings();
    });
    budgetInput.addEventListener("change", async () => {
      const parsed = Number(budgetInput.value);
      this.plugin.settings.maxVisibleNodes = Number.isFinite(parsed) && parsed > 100 ? Math.min(parsed, 50000) : DEFAULT_SETTINGS.maxVisibleNodes;
      budgetInput.value = String(this.plugin.settings.maxVisibleNodes);
      await this.plugin.saveSettings();
    });
    this.applyTheme();
  }

  refresh() {
    const files = this.app.vault.getMarkdownFiles();
    const byPath = new Map();
    const now = Date.now();

    this.nodes = files.map((file) => {
      const cache = this.app.metadataCache.getFileCache(file) || {};
      const frontmatter = cache.frontmatter || {};
      const type = classifyFile(file, frontmatter, cache);
      const style = TYPE_STYLES[type] || TYPE_STYLES.note;
      const searchText = buildSearchText(file, type, frontmatter, cache);
      const modifiedAge = now - file.stat.mtime;
      const node = {
        file,
        path: file.path,
        title: file.basename,
        type,
        label: style.label,
        color: style.color,
        provenance: Boolean(style.provenance),
        agentic: Boolean(style.hot),
        frontmatter,
        searchText,
        degree: 0,
        outgoing: 0,
        incoming: 0,
        recent: modifiedAge < 1000 * 60 * 60 * 24 * 14,
        mtime: file.stat.mtime,
        x: 0,
        y: 0,
        z: 0,
        sx: 0,
        sy: 0,
        sr: 0,
        depth: 0
      };
      byPath.set(file.path, node);
      return node;
    });
    assignClusterPositions(this.nodes);

    const links = [];
    const resolved = this.app.metadataCache.resolvedLinks || {};
    for (const sourcePath of Object.keys(resolved)) {
      const source = byPath.get(sourcePath);
      if (!source) continue;
      for (const targetPath of Object.keys(resolved[sourcePath])) {
        const target = byPath.get(targetPath);
        if (!target || target === source) continue;
        source.degree += 1;
        source.outgoing += 1;
        target.degree += 1;
        target.incoming += 1;
        links.push({
          source,
          target,
          weight: resolved[sourcePath][targetPath] || 1,
          type: inferEdgeType(source, target)
        });
      }
    }

    this.links = links;
    this.applyFilters();
    this.updateWizard();
    this.resize();
  }

  applyFilters() {
    const query = this.state.query;
    const filtered = this.nodes.filter((node) => {
      if (query && !node.searchText.includes(query)) return false;
      if (this.state.mode === "agentic") return node.agentic || node.provenance || node.degree > 2;
      if (this.state.mode === "provenance") return node.provenance || node.type === "source" || node.type === "briefing";
      if (this.state.mode === "recent") return node.recent;
      return true;
    });
    const maxVisible = resolveRenderBudget(this.plugin.settings);
    this.visibleNodes = filtered.length > maxVisible
      ? filtered.slice().sort((a, b) => b.degree - a.degree || b.mtime - a.mtime).slice(0, maxVisible)
      : filtered;

    const visible = new Set(this.visibleNodes);
    this.visibleLinks = this.links.filter((link) => visible.has(link.source) && visible.has(link.target));
    this.renderNodes = this.visibleNodes.slice();
    this.renderLinks = this.visibleLinks.slice();
    this.focusNode = null;
    this.focusNeighbors = null;
    if (this.selected && !visible.has(this.selected)) this.selected = null;
    this.updateStats();
    this.updateDetails();
    this.updateList();
  }

  updateStats() {
    if (!this.stats) return;
    const counts = countBy(this.visibleNodes, "type");
    const agentic = (counts.agent || 0) + (counts.skill || 0) + (counts.briefing || 0) + (counts.decision || 0);
    const capped = this.visibleNodes.length < this.nodes.length ? ` | showing ${this.visibleNodes.length}` : "";
    this.stats.setText(`${this.nodes.length} notes | ${this.visibleLinks.length} links | ${agentic} agentic${capped}`);
  }

  jumpCandidates() {
    const type = this.state.jumpType;
    return this.visibleNodes
      .filter((node) => type === "all" || node.type === type)
      .sort((a, b) => b.degree - a.degree || b.mtime - a.mtime);
  }

  jumpToGroup() {
    const candidates = this.jumpCandidates();
    if (!candidates.length) {
      new Notice("No visible nodes in that group");
      return;
    }
    const node = candidates[this.jumpIndex % candidates.length];
    this.selected = node;
    this.orientToNode(node);
    this.state.zoom = Math.max(this.state.zoom, 1.45);
    this.updateDetails();
  }

  stepJump(direction) {
    const candidates = this.jumpCandidates();
    if (!candidates.length) {
      new Notice("No visible nodes in that group");
      return;
    }
    this.jumpIndex = (this.jumpIndex + direction + candidates.length) % candidates.length;
    this.jumpToGroup();
  }

  orientToNode(node) {
    const yaw = Math.atan2(node.x, node.z || 0.0001);
    const z1 = node.x * Math.sin(yaw) + node.z * Math.cos(yaw);
    const pitch = Math.atan2(node.y, z1 || 0.0001);
    this.state.yaw = yaw;
    this.state.pitch = clamp(pitch, -1.15, 1.15);
  }

  updateDetails() {
    if (!this.details) return;
    const node = this.selected || this.hovered;
    this.details.empty();
    if (!node) {
      this.details.createDiv({ cls: "stellar-detail-title", text: "Agentic overlays" });
      this.details.createDiv({ cls: "stellar-detail-line", text: "Modes filter for agents, skills, sources, briefings, decisions, and recent research state." });
      return;
    }
    this.details.createDiv({ cls: "stellar-detail-kicker", text: node.label });
    this.details.createDiv({ cls: "stellar-detail-title", text: node.title });
    this.details.createDiv({ cls: "stellar-detail-line", text: node.path });
    this.details.createDiv({ cls: "stellar-detail-line", text: `${node.incoming} incoming / ${node.outgoing} outgoing / ${node.degree} total links` });
    if (node.recent) this.details.createDiv({ cls: "stellar-badge", text: "recently changed" });
    if (node.provenance) this.details.createDiv({ cls: "stellar-badge", text: "provenance layer" });
    if (node.agentic) this.details.createDiv({ cls: "stellar-badge", text: "agentic layer" });
  }

  updateList() {
    if (!this.list) return;
    this.list.empty();
    const top = this.visibleNodes
      .slice()
      .sort((a, b) => b.degree - a.degree || b.mtime - a.mtime)
      .slice(0, 9);
    for (const node of top) {
      const item = this.list.createEl("button", { cls: "stellar-list-item", attr: { type: "button" } });
      item.createSpan({ cls: "stellar-list-dot" }).style.background = node.color;
      item.createSpan({ cls: "stellar-list-title", text: node.title });
      item.createSpan({ cls: "stellar-list-type", text: node.type });
      item.addEventListener("mouseenter", () => {
        this.hovered = node;
        this.updateDetails();
      });
      item.addEventListener("click", async () => {
        this.selected = node;
        this.updateDetails();
        await this.openNode(node);
      });
    }
  }

  updateWizard() {
    if (!this.wizard) return;
    this.wizard.empty();
    const sparse = this.nodes.length < 4 || this.links.length < 2;
    if (!this.plugin.settings.showWizardForSparseVaults || !sparse) {
      this.wizard.addClass("is-hidden");
      return;
    }
    this.wizard.removeClass("is-hidden");
    this.wizard.createDiv({ cls: "stellar-wizard-title", text: "Create a graph" });
    this.wizard.createDiv({
      cls: "stellar-wizard-line",
      text: "Stellar Graph works with existing Obsidian links. This vault needs a few linked notes before the map has structure. Starter buttons create the listed sample notes."
    });
    this.wizard.createEl("pre", {
      cls: "stellar-wizard-files",
      text: "Basic: concepts/starting-point.md, sources/first-source.md, projects/example-project.md\nAgentic: agents/research-agent.md, skills/research-synthesis.md, sources/source-inbox.md, BRIEFINGS/example-brief.md"
    });
    const row = this.wizard.createDiv({ cls: "stellar-control-row" });
    makeButton(row, "Obsidian starter", async () => {
      new StarterGraphModal(this.app, false, (agentic) => this.createStarterGraph(agentic)).open();
    });
    makeButton(row, "Agentic starter", async () => {
      new StarterGraphModal(this.app, true, (agentic) => this.createStarterGraph(agentic)).open();
    });
    makeButton(row, "Hide", () => {
      this.plugin.settings.showWizardForSparseVaults = false;
      this.plugin.saveSettings();
      this.updateWizard();
    });
  }

  async createStarterGraph(agentic) {
    const files = starterFiles(agentic);

    try {
      for (const [path, body] of Object.entries(files)) {
        const folder = path.split("/").slice(0, -1).join("/");
        if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
        if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.create(path, body);
      }
    } catch (error) {
      new Notice(`Starter graph failed: ${error.message || error}`);
      return;
    }
    new Notice(agentic ? "Created agentic starter graph" : "Created Obsidian starter graph");
    setTimeout(() => this.refresh(), 600);
  }

  resize() {
    if (!this.canvas || !this.shell) return;
    const rect = this.shell.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  animate() {
    this.frame = 0;
    if (!this.state.paused && !this.drag) this.state.yaw += 0.0028 * this.state.speed;
    this.draw();
    if (!this.state.paused) this.frame = requestAnimationFrame(() => this.animate());
  }

  invalidate() {
    if (this.state.paused) this.draw();
    else if (!this.frame) this.frame = requestAnimationFrame(() => this.animate());
  }

  project(node, width, height) {
    const cosY = Math.cos(this.state.yaw);
    const sinY = Math.sin(this.state.yaw);
    const cosX = Math.cos(this.state.pitch);
    const sinX = Math.sin(this.state.pitch);
    const x1 = node.x * cosY - node.z * sinY;
    const z1 = node.x * sinY + node.z * cosY;
    const y1 = node.y * cosX - z1 * sinX;
    const z2 = node.y * sinX + z1 * cosX;
    const perspective = 2.8 / (2.8 - z2);
    const radius = Math.min(width, height) * 0.34 * this.state.zoom;
    node.sx = width / 2 + x1 * radius * perspective;
    node.sy = height / 2 + y1 * radius * perspective;
    node.depth = z2;
    node.sr = (4.8 + Math.sqrt(node.degree + 1) * 2.5) * perspective;
  }

  draw() {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext("2d");
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;

    ctx.clearRect(0, 0, width, height);
    const theme = THEMES[this.state.theme] || THEMES.night;
    drawBackground(ctx, width, height, this.state.yaw, theme);
    for (const node of this.visibleNodes) this.project(node, width, height);
    drawClusterLabels(ctx, this.visibleNodes, theme);
    if (!this.drag) this.hovered = pickNode(this.visibleNodes, this.pointer.x, this.pointer.y);

    const focusNode = this.state.focus ? this.selected || this.hovered : null;
    if (focusNode !== this.focusNode) {
      this.focusNode = focusNode;
      this.focusNeighbors = focusNode ? neighborSet(this.visibleLinks, focusNode) : null;
    }
    const neighbors = this.focusNeighbors;
    this.renderLinks.sort((a, b) => (a.source.depth + a.target.depth) - (b.source.depth + b.target.depth));
    for (const link of this.renderLinks) drawLink(ctx, link, focusNode, this.state.agentic, theme);

    this.renderNodes.sort((a, b) => a.depth - b.depth);
    const time = this.state.paused ? 0 : performance.now();
    for (const node of this.renderNodes) {
      const active = node === this.hovered || node === this.selected;
      const muted = neighbors && node !== focusNode && !neighbors.has(node);
      drawObject(ctx, node, active, muted, this.state.agentic, time, theme);
    }
    if (this.state.labels) drawLabels(ctx, this.renderNodes, this.hovered || this.selected, neighbors, this.state.labelSize);
    if (this.hovered !== this.lastHover) {
      this.lastHover = this.hovered;
      this.updateDetails();
    }
  }

  handleMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (!this.drag) return;
    const dx = this.pointer.x - this.drag.x;
    const dy = this.pointer.y - this.drag.y;
    this.state.yaw = this.drag.yaw + dx * 0.008;
    this.state.pitch = clamp(this.drag.pitch + dy * 0.006, -1.15, 1.15);
    this.invalidate();
  }

  handleMouseDown(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.drag = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      yaw: this.state.yaw,
      pitch: this.state.pitch
    };
    this.invalidate();
  }

  handleMouseUp() {
    this.drag = null;
    this.invalidate();
  }

  handleMouseLeave() {
    this.hovered = null;
    this.pointer = { x: -9999, y: -9999 };
    this.drag = null;
    this.updateDetails();
    this.invalidate();
  }

  handleWheel(event) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.16 : 0.16;
    this.state.zoom = clamp(this.state.zoom + delta, 0.28, 5);
    this.invalidate();
  }

  async handleClick() {
    if (!this.hovered) return;
    this.selected = this.hovered;
    this.updateDetails();
    await this.openNode(this.hovered);
  }

  async handleKeyDown(event) {
    let handled = true;
    if (event.key === "ArrowLeft") this.state.yaw -= 0.12;
    else if (event.key === "ArrowRight") this.state.yaw += 0.12;
    else if (event.key === "ArrowUp") this.state.pitch = clamp(this.state.pitch - 0.09, -1.15, 1.15);
    else if (event.key === "ArrowDown") this.state.pitch = clamp(this.state.pitch + 0.09, -1.15, 1.15);
    else if (event.key === "+" || event.key === "=") this.state.zoom = clamp(this.state.zoom + 0.28, 0.28, 5);
    else if (event.key === "-" || event.key === "_") this.state.zoom = clamp(this.state.zoom - 0.28, 0.28, 5);
    else if (event.key === "[" || event.key === "PageUp") this.stepJump(-1);
    else if (event.key === "]" || event.key === "PageDown") this.stepJump(1);
    else if (event.key === "Enter") {
      if (!this.selected && this.renderNodes.length) this.selected = this.renderNodes[this.renderNodes.length - 1];
      await this.openNode(this.selected || this.hovered);
    } else if (event.key === "Escape") {
      this.selected = null;
      this.hovered = null;
      this.updateDetails();
    } else {
      handled = false;
    }
    if (!handled) return;
    event.preventDefault();
    this.invalidate();
  }

  async openNode(node) {
    if (!node || !(node.file instanceof TFile)) return;
    if (!this.noteLeaf) this.noteLeaf = this.app.workspace.getLeaf("split");
    await this.noteLeaf.openFile(node.file);
    new Notice(`Opened ${node.file.basename}`);
  }

  applyTheme() {
    if (!this.shell) return;
    this.shell.setAttribute("data-stellar-theme", this.state.theme);
  }
}

class StarterGraphModal extends Modal {
  constructor(app, agentic, onConfirm) {
    super(app);
    this.agentic = agentic;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    const files = this.agentic ? starterFiles(true) : starterFiles(false);
    contentEl.createEl("h2", { text: this.agentic ? "Create agentic starter graph" : "Create Obsidian starter graph" });
    contentEl.createEl("p", {
      text: "This will create only missing files. Existing files with the same paths are left unchanged."
    });
    contentEl.createEl("pre", {
      cls: "stellar-modal-preview",
      text: Object.entries(files).map(([path, body]) => `${path}\n${body.trim()}`).join("\n\n---\n\n")
    });
    const row = contentEl.createDiv({ cls: "stellar-control-row" });
    makeButton(row, "Create files", async () => {
      this.close();
      await this.onConfirm(this.agentic);
    });
    makeButton(row, "Cancel", () => this.close());
  }
}

class StellarGraphSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Stellar Graph" });

    new Setting(containerEl)
      .setName("Display name")
      .setDesc("Shown in the graph controls.")
      .addText((text) => {
        text
          .setPlaceholder("Stellar Graph")
          .setValue(this.plugin.settings.brandName)
          .onChange(async (value) => {
            this.plugin.settings.brandName = value.trim() || DEFAULT_SETTINGS.brandName;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Reduced motion")
      .setDesc("Open graph views paused by default.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.reducedMotion)
          .onChange(async (value) => {
            this.plugin.settings.reducedMotion = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Render budget mode")
      .setDesc("Auto estimates a safe node budget from this device. Manual lets powerful machines render more.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("auto", `Auto (${resolveRenderBudget({ ...this.plugin.settings, renderBudgetMode: "auto" })} nodes)`)
          .addOption("manual", "Manual")
          .setValue(this.plugin.settings.renderBudgetMode || DEFAULT_SETTINGS.renderBudgetMode)
          .onChange(async (value) => {
            this.plugin.settings.renderBudgetMode = value;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName("Manual max visible nodes")
      .setDesc("Used only in Manual mode. Try 5000-20000 on high-end desktops; lower it if animation janks.")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.maxVisibleNodes))
          .onChange(async (value) => {
            const parsed = Number(value);
            this.plugin.settings.maxVisibleNodes = Number.isFinite(parsed) && parsed > 100 ? Math.min(parsed, 50000) : DEFAULT_SETTINGS.maxVisibleNodes;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Default theme")
      .setDesc("Used when a Stellar Graph view opens.")
      .addDropdown((dropdown) => {
        Object.keys(THEMES).forEach((key) => dropdown.addOption(key, THEMES[key].label));
        dropdown
          .setValue(this.plugin.settings.defaultTheme)
          .onChange(async (value) => {
            this.plugin.settings.defaultTheme = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Default mode")
      .setDesc("All mode works with any existing Obsidian graph; agentic modes add workflow overlays where available.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("all", "All")
          .addOption("agentic", "Agentic")
          .addOption("provenance", "Provenance")
          .addOption("recent", "Recent")
          .setValue(this.plugin.settings.defaultMode)
          .onChange(async (value) => {
            this.plugin.settings.defaultMode = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Show starter wizard for sparse vaults")
      .setDesc("When a vault has no meaningful graph yet, show buttons that create linked starter notes.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showWizardForSparseVaults)
          .onChange(async (value) => {
            this.plugin.settings.showWizardForSparseVaults = value;
            await this.plugin.saveSettings();
          });
      });
  }
}

function resolveRenderBudget(settings) {
  if (settings.renderBudgetMode === "manual") {
    return Number(settings.maxVisibleNodes) || DEFAULT_SETTINGS.maxVisibleNodes;
  }
  return estimateAutoRenderBudget();
}

function starterFiles(agentic) {
  return agentic
    ? {
        "agents/research-agent.md": "# Research Agent\n\nConnects [[sources/source-inbox]] to [[BRIEFINGS/example-brief]] using [[skills/research-synthesis]].\n\nType: agent\n",
        "skills/research-synthesis.md": "# Research Synthesis\n\nTurns [[sources/source-inbox]] into linked concepts, entities, and briefings.\n\nType: skill\n",
        "sources/source-inbox.md": "# Source Inbox\n\nRaw material and clipped sources for [[agents/research-agent]].\n\nType: source\n",
        "BRIEFINGS/example-brief.md": "# Example Brief\n\nDerived from [[sources/source-inbox]] by [[agents/research-agent]].\n\nType: briefing\n"
      }
    : {
        "concepts/starting-point.md": "# Starting Point\n\nLinks to [[sources/first-source]] and [[projects/example-project]].\n",
        "sources/first-source.md": "# First Source\n\nA source note connected to [[concepts/starting-point]].\n",
        "projects/example-project.md": "# Example Project\n\nA project note connected to [[concepts/starting-point]].\n"
      };
}

function estimateAutoRenderBudget() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 8;
  const dpr = window.devicePixelRatio || 1;
  let budget = 1000;

  if (cores >= 8) budget += 800;
  if (cores >= 16) budget += 1600;
  if (memory >= 8) budget += 900;
  if (memory >= 16) budget += 1800;
  if (dpr > 1.5) budget -= 500;

  const renderer = getGpuRenderer();
  if (/4090|5090|4080|5080|3090|3080|rtx|radeon rx/i.test(renderer)) budget += 3500;
  if (/5090/i.test(renderer)) budget += 5000;

  return Math.max(800, Math.min(12000, Math.round(budget)));
}

function getGpuRenderer() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "";
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debug) return "";
    return gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || "";
  } catch (error) {
    return "";
  }
}

function classifyFile(file, frontmatter, cache) {
  const first = file.path.split("/")[0].toLowerCase();
  const explicit = String(frontmatter.type || frontmatter.kind || frontmatter.category || "").toLowerCase();
  const tags = extractTags(frontmatter, cache).join(" ");
  const haystack = `${explicit} ${tags} ${file.path} ${file.basename}`.toLowerCase();

  if (matchesAny(haystack, ["briefing", "brief", "report"])) return "briefing";
  if (matchesAny(haystack, ["decision", "choice", "superseded", "claim"])) return "decision";
  if (matchesAny(haystack, ["agent", "agents", "routine", "worker"])) return "agent";
  if (matchesAny(haystack, ["skill", "skills"])) return "skill";
  if (matchesAny(haystack, ["source", "sources", "raw", "clip", "inbox"])) return "source";
  if (matchesAny(haystack, ["project", "projects", "cluster-a", "cluster-b", "cluster-c", "cluster-d", "cluster-e", "cluster-f"])) return "project";
  if (matchesAny(haystack, ["github", "repo", "repository", "org"])) return "github";
  if (matchesAny(haystack, ["system", "systems", "mcp", "infrastructure"])) return "system";
  if (matchesAny(haystack, ["entity", "entities", "persona", "org"])) return "entity";
  if (matchesAny(haystack, ["concept", "concepts", "pattern", "architecture", "comparison"])) return "concept";

  if (first === "agents") return "agent";
  if (first === "skills") return "skill";
  if (first === "sources" || first === "raw") return "source";
  if (first === "briefings") return "briefing";
  if (first === "entities") return "entity";
  if (first === "concepts") return "concept";
  if (first === "projects") return "project";
  if (first === "systems") return "system";
  if (first === "github") return "github";
  if (first === "log" || file.path.toLowerCase() === "log.md") return "log";
  if (/decision|choice|supersed|claim/i.test(file.basename)) return "decision";
  return "note";
}

function buildSearchText(file, type, frontmatter, cache) {
  const values = [
    file.basename,
    file.path,
    type,
    ...extractTags(frontmatter, cache),
    ...extractAliases(frontmatter),
    ...extractHeadings(cache),
    ...extractFrontmatterValues(frontmatter),
    ...extractLinkTargets(cache)
  ];
  return values.filter(Boolean).join(" ").toLowerCase();
}

function extractAliases(frontmatter) {
  const raw = frontmatter.aliases || frontmatter.alias;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(/[,|]/).map((value) => value.trim());
  return [];
}

function extractHeadings(cache) {
  if (!Array.isArray(cache.headings)) return [];
  return cache.headings.map((heading) => heading.heading || "");
}

function extractFrontmatterValues(frontmatter) {
  const values = [];
  for (const [key, value] of Object.entries(frontmatter || {})) {
    if (key === "position") continue;
    values.push(key);
    if (Array.isArray(value)) values.push(...value.map(String));
    else if (value && typeof value === "object") values.push(...Object.values(value).map(String));
    else if (value !== undefined && value !== null) values.push(String(value));
  }
  return values;
}

function extractLinkTargets(cache) {
  const links = [];
  if (Array.isArray(cache.links)) {
    for (const link of cache.links) links.push(link.link || link.original || "");
  }
  if (Array.isArray(cache.embeds)) {
    for (const embed of cache.embeds) links.push(embed.link || embed.original || "");
  }
  return links;
}

function matchesAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function extractTags(frontmatter, cache) {
  const tags = [];
  const raw = frontmatter.tags || frontmatter.tag;
  if (Array.isArray(raw)) tags.push(...raw);
  else if (typeof raw === "string") tags.push(...raw.split(/[,\s]+/));
  if (Array.isArray(cache.tags)) {
    for (const tag of cache.tags) tags.push(tag.tag || "");
  }
  return tags.map((tag) => String(tag).replace(/^#/, "").toLowerCase()).filter(Boolean);
}

function assignClusterPositions(nodes) {
  const groups = new Map();
  for (const node of nodes) {
    if (!groups.has(node.type)) groups.set(node.type, []);
    groups.get(node.type).push(node);
  }
  const types = TYPE_ORDER.filter((type) => groups.has(type));
  for (const [typeIndex, type] of types.entries()) {
    const group = groups.get(type).sort((a, b) => a.path.localeCompare(b.path));
    const center = fibonacciPoint(typeIndex, Math.max(2, types.length));
    for (const [nodeIndex, node] of group.entries()) {
      const local = fibonacciPoint(nodeIndex, Math.max(2, group.length));
      const spread = group.length < 4 ? 0.2 : 0.32;
      const point = normalizePoint({
        x: center.x * 0.82 + local.x * spread,
        y: center.y * 0.82 + local.y * spread,
        z: center.z * 0.82 + local.z * spread
      });
      node.x = point.x;
      node.y = point.y;
      node.z = point.z;
    }
  }
}

function normalizePoint(point) {
  const length = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z) || 1;
  return { x: point.x / length, y: point.y / length, z: point.z / length };
}

function inferEdgeType(source, target) {
  if (source.type === "source" && ["concept", "entity", "briefing"].includes(target.type)) return "derived";
  if (source.type === "briefing" || target.type === "briefing") return "briefing";
  if (source.agentic || target.agentic) return "agentic";
  return "link";
}

function fibonacciPoint(index, count) {
  if (count <= 1) return { x: 0, y: 0, z: 1 };
  const offset = 2 / count;
  const increment = Math.PI * (3 - Math.sqrt(5));
  const y = index * offset - 1 + offset / 2;
  const r = Math.sqrt(1 - y * y);
  const phi = index * increment;
  return { x: Math.cos(phi) * r, y, z: Math.sin(phi) * r };
}

function drawBackground(ctx, width, height, yaw, theme) {
  if (theme.grid === "horizon") {
    drawXpDesktop(ctx, width, height, theme);
    return;
  }
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.45, 0, width * 0.5, height * 0.52, Math.max(width, height) * 0.72);
  gradient.addColorStop(0, theme.bg[0]);
  gradient.addColorStop(0.52, theme.bg[1]);
  gradient.addColorStop(1, theme.bg[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (theme.grid === "pixel") drawPixelGrid(ctx, width, height, yaw, theme);
  if (theme.grid === "windows") drawWin31Grid(ctx, width, height, theme);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(yaw * 0.16);
  const radius = Math.min(width, height) * 0.35;
  for (let i = 0; i < 5; i += 1) {
    ctx.globalAlpha = 0.08 + i * 0.025;
    ctx.strokeStyle = i % 2 ? theme.accent2 : theme.accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * (1 - i * 0.11), radius * (0.24 + i * 0.08), i * 0.48, 0, TWO_PI);
    ctx.stroke();
  }
  ctx.restore();
}

function drawClusterLabels(ctx, nodes, theme) {
  const clusters = new Map();
  for (const node of nodes) {
    if (!clusters.has(node.type)) clusters.set(node.type, { x: 0, y: 0, depth: 0, count: 0, label: node.label, color: node.color });
    const cluster = clusters.get(node.type);
    cluster.x += node.sx;
    cluster.y += node.sy;
    cluster.depth += node.depth;
    cluster.count += 1;
  }

  ctx.save();
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  for (const cluster of clusters.values()) {
    const x = cluster.x / cluster.count;
    const y = cluster.y / cluster.count;
    const depth = cluster.depth / cluster.count;
    const text = `${cluster.label} ${cluster.count}`;
    const width = ctx.measureText(text).width + 18;
    const alpha = Math.max(0.28, Math.min(0.72, 0.42 + depth * 0.16));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = theme.panel === "win31" ? "#d4d0c8" : "rgba(5, 8, 13, 0.68)";
    ctx.strokeStyle = cluster.color;
    ctx.lineWidth = 1;
    roundRect(ctx, x - width / 2, y - 24, width, 22, 6);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = Math.min(0.95, alpha + 0.22);
    ctx.fillStyle = theme.panel === "win31" ? "#000000" : "#eef8ff";
    ctx.fillText(text, x - width / 2 + 9, y - 13);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawPixelGrid(ctx, width, height, yaw, theme) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = theme.accent2;
  ctx.lineWidth = 1;
  const step = 28;
  const offset = (yaw * 80) % step;
  for (let x = -step + offset; x < width + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + width * 0.2, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWin31Grid(ctx, width, height, theme) {
  ctx.save();
  ctx.fillStyle = "#c0c0c0";
  ctx.fillRect(0, 0, width, 28);
  ctx.fillStyle = "#000080";
  ctx.fillRect(2, 2, width - 4, 24);
  ctx.fillStyle = "#ffffff";
  ctx.font = "12px monospace";
  ctx.fillText("Stellar Graph - Agentic Vault Map", 10, 18);
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = theme.accent2;
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawXpDesktop(ctx, width, height, theme) {
  ctx.save();
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.72);
  sky.addColorStop(0, "#77c9ff");
  sky.addColorStop(0.42, "#2d8eed");
  sky.addColorStop(1, "#1c62c6");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#ffffff";
  drawCloud(ctx, width * 0.18, height * 0.16, Math.min(width, height) * 0.045);
  drawCloud(ctx, width * 0.68, height * 0.24, Math.min(width, height) * 0.036);
  ctx.globalAlpha = 1;
  const hill = ctx.createLinearGradient(0, height * 0.45, 0, height);
  hill.addColorStop(0, "#9ed96a");
  hill.addColorStop(0.52, "#49a33f");
  hill.addColorStop(1, "#0f6a2f");
  ctx.fillStyle = hill;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.bezierCurveTo(width * 0.22, height * 0.42, width * 0.58, height * 0.63, width, height * 0.47);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = theme.accent2;
  ctx.beginPath();
  ctx.arc(width * 0.8, height * 0.18, Math.min(width, height) * 0.055, 0, TWO_PI);
  ctx.fill();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = theme.accent2;
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 56) {
    ctx.beginPath();
    ctx.moveTo(x, height * 0.56);
    ctx.lineTo(x - width * 0.18, height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCloud(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x - r * 0.9, y + r * 0.18, r * 0.72, 0, TWO_PI);
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.arc(x + r * 0.9, y + r * 0.24, r * 0.68, 0, TWO_PI);
  ctx.rect(x - r * 1.4, y + r * 0.18, r * 2.8, r * 0.72);
  ctx.fill();
}

function drawLink(ctx, link, focusNode, agenticOn, theme) {
  const focused = !focusNode || link.source === focusNode || link.target === focusNode;
  const depth = (link.source.depth + link.target.depth) / 2;
  const alpha = focused ? Math.max(0.08, Math.min(0.5, 0.18 + depth * 0.18)) : 0.035;
  ctx.beginPath();
  ctx.moveTo(link.source.sx, link.source.sy);
  ctx.lineTo(link.target.sx, link.target.sy);
  ctx.strokeStyle = edgeColor(link, alpha, agenticOn, theme);
  ctx.lineWidth = focused ? Math.max(0.75, Math.min(2.8, link.weight * 0.75)) : 0.55;
  ctx.stroke();
}

function edgeColor(link, alpha, agenticOn, theme) {
  const [r, g, b] = theme.link;
  if (!agenticOn) return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  if (link.type === "agentic") return `rgba(84, 215, 255, ${alpha + 0.12})`;
  if (link.type === "derived") return `rgba(255, 228, 119, ${alpha + 0.1})`;
  if (link.type === "briefing") return `rgba(255, 255, 255, ${alpha + 0.08})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawObject(ctx, node, active, muted, agenticOn, time, theme) {
  const radius = active ? node.sr * 1.55 : node.sr;
  const pulse = node.recent ? 1 + Math.sin(time * 0.006 + node.mtime * 0.00001) * 0.16 : 1;
  const alpha = muted ? 0.18 : Math.max(0.32, Math.min(1, 0.68 + node.depth * 0.24));

  ctx.save();
  ctx.globalAlpha = alpha;
  if (agenticOn && (node.agentic || node.provenance || node.recent)) drawHalo(ctx, node, radius * pulse, active, time, theme);
  if (theme.grid === "windows") drawWin31Icon(ctx, node, radius * pulse, active);
  else if (theme.grid === "horizon") drawXpIcon(ctx, node, radius * pulse, active);
  else if (theme.grid === "pixel") drawVoxel(ctx, node, radius * pulse, active);
  else drawSphere(ctx, node, radius * pulse, active);
  if (agenticOn) drawTypeGlyph(ctx, node, radius * pulse);
  ctx.restore();
}

function drawHalo(ctx, node, radius, active, time, theme) {
  ctx.save();
  ctx.translate(node.sx, node.sy);
  ctx.rotate(time * 0.0015 + node.depth);
  ctx.globalAlpha = active ? 0.92 : 0.42;
  ctx.strokeStyle = node.provenance ? theme.accent2 : node.color;
  ctx.lineWidth = active ? 1.8 : 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.95, radius * 0.62, 0, 0, TWO_PI);
  ctx.stroke();
  if (node.recent) {
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2.45, 0, TWO_PI);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVoxel(ctx, node, radius, active) {
  const size = radius * (active ? 1.5 : 1.22);
  ctx.save();
  ctx.translate(node.sx, node.sy);
  ctx.shadowColor = node.color;
  ctx.shadowBlur = active ? 30 : 14;
  ctx.fillStyle = shade(node.color, -42);
  ctx.fillRect(-size * 0.5, -size * 0.32, size, size * 0.72);
  ctx.fillStyle = tint(node.color, 48);
  ctx.beginPath();
  ctx.moveTo(-size * 0.5, -size * 0.32);
  ctx.lineTo(-size * 0.12, -size * 0.64);
  ctx.lineTo(size * 0.88, -size * 0.64);
  ctx.lineTo(size * 0.5, -size * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(node.color, -78);
  ctx.beginPath();
  ctx.moveTo(size * 0.5, -size * 0.32);
  ctx.lineTo(size * 0.88, -size * 0.64);
  ctx.lineTo(size * 0.88, size * 0.08);
  ctx.lineTo(size * 0.5, size * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = active ? "#ffffff" : "rgba(255,255,255,0.45)";
  ctx.strokeRect(-size * 0.5, -size * 0.32, size, size * 0.72);
  ctx.restore();
}

function drawWin31Icon(ctx, node, radius, active) {
  const size = radius * (active ? 1.75 : 1.35);
  ctx.save();
  ctx.translate(node.sx, node.sy);
  ctx.shadowBlur = 0;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#c0c0c0";
  ctx.fillRect(-size * 0.6, -size * 0.5, size * 1.2, size);
  ctx.fillStyle = "#000080";
  ctx.fillRect(-size * 0.46, -size * 0.3, size * 0.92, size * 0.16);
  ctx.fillStyle = quantizeRetroColor(node.color);
  ctx.fillRect(-size * 0.46, -size * 0.12, size * 0.92, size * 0.44);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-size * 0.36, -size * 0.02, size * 0.18, size * 0.12);
  ctx.fillRect(size * 0.04, size * 0.08, size * 0.24, size * 0.12);
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(-size * 0.6, size * 0.5);
  ctx.lineTo(-size * 0.6, -size * 0.5);
  ctx.lineTo(size * 0.6, -size * 0.5);
  ctx.stroke();
  ctx.strokeStyle = "#404040";
  ctx.beginPath();
  ctx.moveTo(size * 0.6, -size * 0.5);
  ctx.lineTo(size * 0.6, size * 0.5);
  ctx.lineTo(-size * 0.6, size * 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawXpIcon(ctx, node, radius, active) {
  const size = radius * (active ? 1.9 : 1.45);
  ctx.save();
  ctx.translate(node.sx, node.sy);
  ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
  ctx.shadowBlur = active ? 18 : 8;
  ctx.shadowOffsetY = Math.max(2, size * 0.12);
  const body = ctx.createLinearGradient(-size * 0.45, -size * 0.5, size * 0.45, size * 0.5);
  body.addColorStop(0, "#ffffff");
  body.addColorStop(0.16, tint(node.color, 62));
  body.addColorStop(0.58, node.color);
  body.addColorStop(1, shade(node.color, -64));
  ctx.fillStyle = body;
  roundRect(ctx, -size * 0.52, -size * 0.42, size * 1.04, size * 0.84, size * 0.14);
  ctx.fill();
  ctx.shadowBlur = 0;
  const tab = ctx.createLinearGradient(0, -size * 0.56, 0, -size * 0.22);
  tab.addColorStop(0, "#fffbd1");
  tab.addColorStop(1, "#f0bc2d");
  ctx.fillStyle = tab;
  roundRect(ctx, -size * 0.42, -size * 0.58, size * 0.58, size * 0.24, size * 0.08);
  ctx.fill();
  ctx.strokeStyle = active ? "#ffffff" : "rgba(255,255,255,0.72)";
  ctx.lineWidth = active ? 2 : 1;
  roundRect(ctx, -size * 0.52, -size * 0.42, size * 1.04, size * 0.84, size * 0.14);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(-size * 0.18, -size * 0.18, size * 0.25, size * 0.11, -0.45, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function quantizeRetroColor(hex) {
  const palette = ["#000000", "#000080", "#008000", "#008080", "#800000", "#800080", "#808000", "#c0c0c0", "#808080", "#0000ff", "#00ff00", "#00ffff", "#ff0000", "#ff00ff", "#ffff00", "#ffffff"];
  const value = parseInt(hex.slice(1), 16);
  const r = value >> 16;
  const g = (value >> 8) & 255;
  const b = value & 255;
  let best = palette[0];
  let bestDistance = Infinity;
  for (const color of palette) {
    const c = parseInt(color.slice(1), 16);
    const cr = c >> 16;
    const cg = (c >> 8) & 255;
    const cb = c & 255;
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (distance < bestDistance) {
      best = color;
      bestDistance = distance;
    }
  }
  return best;
}

function drawSphere(ctx, node, radius, active) {
  ctx.shadowColor = node.color;
  ctx.shadowBlur = active ? 34 : Math.max(6, 12 * node.depth);
  const gradient = ctx.createRadialGradient(node.sx - radius * 0.38, node.sy - radius * 0.46, radius * 0.08, node.sx, node.sy, radius);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.16, tint(node.color, 40));
  gradient.addColorStop(0.55, node.color);
  gradient.addColorStop(0.82, shade(node.color, -70));
  gradient.addColorStop(1, "#02040a");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(node.sx, node.sy, radius, 0, TWO_PI);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha *= active ? 1 : 0.72;
  ctx.strokeStyle = active ? "#ffffff" : tint(node.color, 20);
  ctx.lineWidth = active ? 2 : 0.8;
  ctx.stroke();
}

function drawTypeGlyph(ctx, node, radius) {
  ctx.save();
  ctx.translate(node.sx, node.sy);
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.lineWidth = 1;
  const r = Math.max(3, radius * 0.34);
  if (node.type === "agent") {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, r);
    ctx.lineTo(-r, r);
    ctx.closePath();
    ctx.stroke();
  } else if (node.type === "skill") {
    ctx.strokeRect(-r, -r, r * 2, r * 2);
  } else if (node.provenance) {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.stroke();
  } else if (node.type === "entity") {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TWO_PI);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLabels(ctx, nodes, primary, neighbors, labelSize) {
  ctx.save();
  const size = labelSize || 16;
  ctx.font = `${size}px var(--font-interface, sans-serif)`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const node of nodes) {
    const important = node === primary || node.degree > 2 || node.agentic || node.provenance;
    if (!important || (neighbors && node !== primary && !neighbors.has(node))) continue;
    const active = node === primary;
    ctx.globalAlpha = active ? 1 : Math.min(0.82, Math.max(0.16, node.depth));
    ctx.fillStyle = active ? "#ffffff" : "#d8e7f2";
    ctx.shadowColor = "#020307";
    ctx.shadowBlur = 12;
    ctx.lineWidth = Math.max(3, size * 0.24);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
    ctx.strokeText(node.title, node.sx, node.sy - node.sr - (active ? size + 8 : size * 0.8));
    ctx.fillText(node.title, node.sx, node.sy - node.sr - (active ? size + 8 : size * 0.8));
  }
  ctx.restore();
}

function pickNode(nodes, x, y) {
  let picked = null;
  let best = Infinity;
  for (const node of nodes) {
    const dx = node.sx - x;
    const dy = node.sy - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const hit = Math.max(13, node.sr + 5);
    if (distance < hit && distance < best) {
      picked = node;
      best = distance;
    }
  }
  return picked;
}

function neighborSet(links, node) {
  const set = new Set([node]);
  for (const link of links) {
    if (link.source === node) set.add(link.target);
    if (link.target === node) set.add(link.source);
  }
  return set;
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    counts[item[key]] = (counts[item[key]] || 0) + 1;
    return counts;
  }, {});
}

function makeButton(parent, text, onClick) {
  const button = parent.createEl("button", { cls: "stellar-button", text, attr: { type: "button" } });
  button.addEventListener("click", onClick);
  return button;
}

function debounce(fn, wait) {
  let timeout = 0;
  const debounced = (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timeout);
  return debounced;
}

function tint(hex, amount) {
  return shiftColor(hex, amount);
}

function shade(hex, amount) {
  return shiftColor(hex, amount);
}

function shiftColor(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const r = clamp((value >> 16) + amount, 0, 255);
  const g = clamp(((value >> 8) & 255) + amount, 0, 255);
  const b = clamp((value & 255) + amount, 0, 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}
