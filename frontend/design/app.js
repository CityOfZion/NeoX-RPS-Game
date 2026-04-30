const MOVES = ["rock", "paper", "scissors"];
const BEATS = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};
const WIN_MULTIPLIER = 10;
const BATTLE_RESULT_DELAY_MS = 1700;
const MOBILE_BREAKPOINT = window.matchMedia("(max-width: 768px)");
const LOTTIE_RENDERER_SETTINGS = {
  preserveAspectRatio: "xMidYMid meet",
  progressiveLoad: true,
  hideOnTransparent: true,
};

const elements = {
  appShell: document.querySelector(".app-shell"),
  sidebar: document.querySelector(".sidebar"),
  arena: document.querySelector(".arena"),
  arenaBackBtn: document.getElementById("arenaBackBtn"),
  walletGate: document.getElementById("walletGate"),
  walletOptions: Array.from(document.querySelectorAll("[data-wallet-option]")),
  toggles: Array.from(document.querySelectorAll(".toggle")),
  moveButtons: Array.from(document.querySelectorAll(".move-btn")),
  commitBtn: document.getElementById("commitBtn"),
  leftAnim: document.getElementById("leftAnim"),
  rightAnim: document.getElementById("rightAnim"),
  resultBadge: document.getElementById("resultBadge"),
  betAmountInput: document.getElementById("betAmountInput"),
  winningsValue: document.getElementById("winningsValue"),
};

let selectedMove = "rock";
let leftPlayer = null;
let rightPlayer = null;
let runningBattle = null;
let currentWinnings = 0;
let winningsFrame = null;

const moveCase = (move) => move.charAt(0).toUpperCase() + move.slice(1);
const randomMove = () => MOVES[Math.floor(Math.random() * MOVES.length)];
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const formatWinnings = (value) => `${value.toFixed(2)} MEV`;

function parseBetInput() {
  const value = Number.parseFloat(elements.betAmountInput.value);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function animateWinnings(targetWinnings) {
  if (winningsFrame) {
    window.cancelAnimationFrame(winningsFrame);
    winningsFrame = null;
  }

  const start = currentWinnings;
  const delta = targetWinnings - start;
  const duration = 980;
  const startedAt = performance.now();
  const direction = delta === 0 ? 0 : Math.sign(delta);
  const baseJitter = Math.max(1.2, Math.abs(delta) * 0.04);

  const tick = (now) => {
    const t = Math.min((now - startedAt) / duration, 1);
    const eased = easeInOutSine(t);
    const baseValue = start + delta * eased;
    const damping = Math.pow(1 - t, 1.8);
    const waveA = Math.sin(now * 0.028);
    const waveB = Math.sin(now * 0.013 + 1.2);
    const jitter =
      t < 0.985
        ? direction * (waveA * 0.65 + waveB * 0.35) * baseJitter * damping
        : 0;
    const displayValue = Math.max(0, baseValue + jitter);

    elements.winningsValue.textContent = formatWinnings(displayValue);

    if (t < 1) {
      winningsFrame = window.requestAnimationFrame(tick);
      return;
    }

    currentWinnings = targetWinnings;
    elements.winningsValue.textContent = formatWinnings(targetWinnings);
    winningsFrame = null;
  };

  winningsFrame = window.requestAnimationFrame(tick);
}

function syncWinningsWithBet() {
  const bet = parseBetInput();
  animateWinnings(bet * WIN_MULTIPLIER);
}

function setSelectedMove(move) {
  selectedMove = move;
  elements.moveButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.move === move);
  });
}

function clearPlayers() {
  if (leftPlayer) {
    leftPlayer.destroy();
    leftPlayer = null;
  }
  if (rightPlayer) {
    rightPlayer.destroy();
    rightPlayer = null;
  }
  elements.leftAnim.innerHTML = "";
  elements.rightAnim.innerHTML = "";
}

function loadBattleAnimations(playerMove, opponentMove) {
  clearPlayers();

  if (!window.lottie) {
    elements.leftAnim.innerHTML = `<div class="fallback-hand">${moveCase(playerMove)}</div>`;
    elements.rightAnim.innerHTML = `<div class="fallback-hand">${moveCase(opponentMove)}</div>`;
    return;
  }

  leftPlayer = window.lottie.loadAnimation({
    container: elements.leftAnim,
    renderer: "svg",
    rendererSettings: LOTTIE_RENDERER_SETTINGS,
    loop: false,
    autoplay: true,
    path: `./left-${playerMove}.json`,
  });

  rightPlayer = window.lottie.loadAnimation({
    container: elements.rightAnim,
    renderer: "svg",
    rendererSettings: LOTTIE_RENDERER_SETTINGS,
    loop: false,
    autoplay: true,
    path: `./right-${opponentMove}.json`,
  });
}

function resolveResult(playerMove, opponentMove) {
  if (playerMove === opponentMove) {
    return { tone: "draw", text: "Draw!" };
  }
  if (BEATS[playerMove] === opponentMove) {
    return { tone: "win", text: "You won!" };
  }
  return { tone: "lose", text: "You lost!" };
}

function updateResultBadge(result) {
  elements.resultBadge.classList.remove("hidden", "win", "lose", "draw");
  elements.resultBadge.classList.add(result.tone);
  elements.resultBadge.textContent = result.text;
}

function hideResultBadge() {
  elements.resultBadge.classList.add("hidden");
  elements.resultBadge.classList.remove("win", "lose", "draw");
}

function updateMobileLayoutMode() {
  if (!elements.appShell) {
    return;
  }

  if (MOBILE_BREAKPOINT.matches) {
    setMobileArenaVisible(false);
    return;
  }

  elements.appShell.classList.remove("mobile-arena-hidden");
  elements.appShell.classList.remove("mobile-arena-visible");
}

function setMobileArenaVisible(visible) {
  if (!elements.appShell) {
    return;
  }

  elements.appShell.classList.toggle("mobile-arena-visible", visible);
  elements.appShell.classList.toggle("mobile-arena-hidden", !visible);
}

function revealArenaOnMobile() {
  if (!elements.appShell || !elements.arena || !MOBILE_BREAKPOINT.matches) {
    return;
  }

  setMobileArenaVisible(true);
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}

function returnToSidebarOnMobile() {
  if (!elements.appShell || !elements.sidebar || !MOBILE_BREAKPOINT.matches) {
    return;
  }

  setMobileArenaVisible(false);
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}

function setupToggles() {
  elements.toggles.forEach((toggle) => {
    toggle.setAttribute("aria-pressed", String(toggle.classList.contains("is-on")));
    toggle.addEventListener("click", () => {
      const isOn = toggle.classList.toggle("is-on");
      toggle.setAttribute("aria-pressed", String(isOn));
    });
  });
}

function unlockWalletGate() {
  if (!elements.appShell) {
    return;
  }
  elements.appShell.classList.add("wallet-unlocked");
}

function setupWalletGate() {
  if (!elements.walletGate || elements.walletOptions.length === 0) {
    return;
  }

  elements.walletOptions.forEach((optionButton) => {
    optionButton.addEventListener("click", unlockWalletGate);
  });
}

function runBattle() {
  if (!elements.appShell.classList.contains("wallet-unlocked")) {
    return;
  }

  if (runningBattle) {
    window.clearTimeout(runningBattle);
    runningBattle = null;
  }

  const playerMove = selectedMove;
  const opponentMove = randomMove();

  hideResultBadge();
  revealArenaOnMobile();
  loadBattleAnimations(playerMove, opponentMove);

  runningBattle = window.setTimeout(() => {
    const result = resolveResult(playerMove, opponentMove);
    updateResultBadge(result);
    runningBattle = null;
  }, BATTLE_RESULT_DELAY_MS);
}

function bindEvents() {
  elements.moveButtons.forEach((button) => {
    button.addEventListener("click", () => setSelectedMove(button.dataset.move));
  });

  if (elements.commitBtn) {
    elements.commitBtn.addEventListener("click", runBattle);
  }
  if (elements.betAmountInput) {
    elements.betAmountInput.addEventListener("input", syncWinningsWithBet);
    elements.betAmountInput.addEventListener("change", syncWinningsWithBet);
  }
  if (elements.arenaBackBtn) {
    elements.arenaBackBtn.addEventListener("click", returnToSidebarOnMobile);
  }
  MOBILE_BREAKPOINT.addEventListener("change", updateMobileLayoutMode);
}

function init() {
  bindEvents();
  setupToggles();
  setupWalletGate();
  setSelectedMove(selectedMove);
  elements.winningsValue.textContent = formatWinnings(0);
  updateMobileLayoutMode();
}

init();
