import "./styles.css";
// obadiah3d main.js —— UI 接線+護送/供養 HUD+播報(字幕+mp3 人聲)+經文朗讀(曉臻)
// 玩法:WASD 帶先知小隊避兵丁火把光錐→到洞口藏好一批(進度 /100)→折返再帶→藏滿一百→
//      拿餅和水供養:指針進綠區按 J 分餅/K 遞水/L 求神保守。
import { ObadiahGame, DIFFICULTY_PRESETS } from "./game.js";
import { AudioManager } from "./audio.js";
import { loadSettings, saveSettings } from "./storage.js";
import { speakLine, setVoiceEnabled } from "./voice.js";
import { SCRIPTURES } from "./voicePhrases.js";

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $("gameCanvas"),
  scoreSheet: $("scoreSheet"),
  powerPanel: $("powerPanel"), powerFill: $("powerFill"), powerLabel: $("powerLabel"),
  statusMessage: $("statusMessage"), commentaryBar: $("commentaryBar"), strikeFlash: $("strikeFlash"),
  touchRoll: $("touchRoll"), touchLeft: $("touchLeft"), touchRight: $("touchRight"),
  menuButton: $("menuButton"), audioButton: $("audioButton"), cameraButton: $("cameraButton"),
  matchOverlay: $("matchOverlay"), overlayTitle: $("overlayTitle"), overlayText: $("overlayText"),
  overlayMenuButton: $("overlayMenuButton"), overlayReplayButton: $("overlayReplayButton"),
  homeScreen: $("homeScreen"),
  framesSelect: $("framesSelect"), difficultySelect: $("difficultySelect"), audioSelect: $("audioSelect"),
  startMatchButton: $("startMatchButton"),
};

const settings = loadSettings();
let selectedDifficulty = DIFFICULTY_PRESETS[settings.difficulty] ? settings.difficulty : "easy";
let selectedFrames = [1, 2, 3].includes(settings.frames) ? settings.frames : 2;
let audioEnabled = settings.audioEnabled !== false;

const audio = new AudioManager();
audio.setEnabled(audioEnabled);
setVoiceEnabled(audioEnabled);

const game = new ObadiahGame({ canvas: ui.canvas });
window.__obadiah3d = game; // dev hook

function pushCommentary(sub, tone = "info", say = "") {
  const bar = ui.commentaryBar;
  if (!bar || !sub) return;
  bar.hidden = false;
  bar.dataset.tone = tone;
  bar.textContent = sub;
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
  if (say) speakLine(say);
}
function flash(text, ms = 1200) {
  ui.strikeFlash.hidden = false;
  ui.strikeFlash.textContent = text;
  ui.strikeFlash.style.animation = "none";
  void ui.strikeFlash.offsetWidth;
  ui.strikeFlash.style.animation = "";
  setTimeout(() => { ui.strikeFlash.hidden = true; }, ms);
}

game.onEvent = (event) => {
  switch (event.type) {
    case "match-start":
      pushCommentary("耶洗別殺耶和華眾先知的時候,俄巴底將先知藏起來——趁夜帶他們進洞!(王上18:13)", "info", SCRIPTURES[1]); // 開幕經文自動朗讀(曉臻)
      setTimeout(() => speakLine("耶洗別殺先知,快帶他們藏起來!"), 9000);
      break;
    case "caught":
      audio.buzz();
      flash("被發現了!", 1000);
      pushCommentary("火把照到你了……退回藏身點,貼著岩石樹叢走!", "cool", "被發現了,退回藏身點!");
      break;
    case "boss":
      audio.buzz();
      flash("軍長來了!", 1400);
      pushCommentary("軍長突然出現,直朝你追來——快躲進岩石樹叢!", "cool", "軍長來了,快躲起來!");
      break;
    case "batch-hidden":
      audio.cheer(); audio.uiTap();
      flash("藏好一批!", 1000);
      pushCommentary(`一批先知平安藏進洞裡了!已藏 ${event.hidden}/100——回去再帶下一批。`, "hot", "藏好一批,再帶下一批!");
      break;
    case "straggler":
      pushCommentary("有先知落後了……放慢腳步,等等他們——一個也不能失落。", "cool", "放慢腳步,等等先知們。");
      break;
    case "provision-start":
      audio.cheer();
      flash("藏滿一百!", 1200);
      pushCommentary("一百位先知都藏好了!拿餅和水供養——指針進綠區,照順序按!", "hot", "先知都藏好了,拿餅和水供養!");
      break;
    case "provision-hit":
      audio.kick(0.8);
      flash(event.label + "!", 900);
      pushCommentary(`${event.label}!俄巴底供養先知,神必保守!`, "hot", event.phrase);
      break;
    case "provision-miss":
      audio.uiTap();
      pushCommentary("還沒到時候……等指針進綠區再按!", "cool", "還沒到時候,再等指針進綠區。");
      break;
    case "provision-wrong":
      pushCommentary(`現在要做的是「${event.expect}」!`, "cool", "");
      break;
    case "finale":
      audio.horn(); audio.crowdCheer(1);
      flash("先知都平安!", 1800);
      pushCommentary("餅和水都送到了——神藉俄巴底保存了一百位先知!(王上18:4)", "hot", "先知都得餅得水,平安了!");
      setTimeout(() => speakLine("神保存了一百位先知!"), 2400);
      break;
    case "status":
      pushCommentary(event.text, "info", "");
      break;
    case "match-end":
      try { if (!['localhost','127.0.0.1'].includes(location.hostname)) {   // -done:玩完一局(t=本局秒數,/stats 使用次數與平均停留吃這個)
        var __dt = Math.round((Date.now() - (window.__matchT0 || Date.now())) / 1000);
        navigator.sendBeacon?.('https://hfpc-play-stats.summer09201017.workers.dev/api/ping?g=obadiah3d-done&t=' + __dt);
      } } catch (_) {}
      window.psPing?.("obadiah3d-done", window.__psT0 ? Math.round((Date.now() - window.__psT0) / 1000) : 0);
      audio.cheer(); audio.crowdCheer(1);
      ui.matchOverlay.classList.add("visible");
      ui.overlayTitle.textContent = event.title;
      ui.overlayText.textContent = event.text;
      if (event.caught === 0) speakLine("完美護送,無人被發現。");
      setTimeout(() => speakLine(SCRIPTURES[0]), 2600); // 終幕經文自動朗讀(曉臻)
      break;
    default:
      break;
  }
};

// HUD:護送=進度條(已藏 /100);供養=指針大條+綠區
game.onHud = (s) => {
  ui.statusMessage.textContent = s.message;
  if (s.phase === "provision") {
    ui.powerPanel.hidden = false;
    ui.powerLabel.textContent = `供養:${s.provLabel}`;
    ui.powerFill.style.transform = `scaleX(${s.meterValue})`;
    const inWin = s.meterValue >= s.windowStart && s.meterValue <= s.windowEnd;
    ui.powerFill.classList.toggle("full", inWin);
  } else if (s.phase === "escort") {
    ui.powerPanel.hidden = false;
    ui.powerLabel.textContent = `已藏先知 ${s.hidden}/${s.total}`;
    ui.powerFill.style.transform = `scaleX(${s.hidden / s.total})`;
    ui.powerFill.classList.remove("full");
  } else {
    ui.powerPanel.hidden = true;
  }
  if (ui.touchRoll) {
    ui.touchRoll.hidden = s.phase !== "provision";
    ui.touchRoll.textContent = s.phase === "provision" ? `🍞 ${s.provLabel}(J/K/L 或點我)` : "—";
    ui.touchRoll.disabled = s.phase !== "provision";
  }
  const escort = s.phase === "escort";
  if (ui.touchLeft) ui.touchLeft.hidden = !escort;
  if (ui.touchRight) ui.touchRight.hidden = !escort;
  if (s.phase === "menu") { ui.scoreSheet.hidden = true; return; }
  ui.scoreSheet.hidden = false;
  ui.scoreSheet.innerHTML = `<table><tr><td class="pname">梯次</td><td class="total">${s.tripIdx}/${s.totalTrips}</td></tr><tr><td class="pname">被發現</td><td class="total">${s.caught} 次</td></tr></table><div class="stones-left">已藏 ${s.hidden}/${s.total}・避開耶洗別的兵</div>`;
};

// ── 鍵盤:WASD/方向鍵 移動;J/K/L 供養;V 視角 ──
const held = { x: 0, z: 0 };
function syncMove() { game.move.x = held.x; game.move.z = held.z; }
window.addEventListener("keydown", (e) => {
  if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
  if (game.phase === "menu" || game.phase === "done") return;
  audio.unlock();
  if (e.code === "KeyA" || e.code === "ArrowLeft") held.x = -1;
  if (e.code === "KeyD" || e.code === "ArrowRight") held.x = 1;
  if (e.code === "KeyW" || e.code === "ArrowUp") held.z = -1;
  if (e.code === "KeyS" || e.code === "ArrowDown") held.z = 1;
  syncMove();
  if (!e.repeat) {
    if (e.code === "Space") game.pressProvision(["bread", "water", "keep"][game.provIdx] || "bread"); // 空白鍵=當前該做的供養
    if (e.code === "KeyJ") game.pressProvision("bread");
    if (e.code === "KeyK") game.pressProvision("water");
    if (e.code === "KeyL") game.pressProvision("keep");
    if (e.code === "KeyV") game.cycleCamView();
  }
});
window.addEventListener("keyup", (e) => {
  if (["KeyA", "ArrowLeft"].includes(e.code) && held.x === -1) held.x = 0;
  if (["KeyD", "ArrowRight"].includes(e.code) && held.x === 1) held.x = 0;
  if (["KeyW", "ArrowUp"].includes(e.code) && held.z === -1) held.z = 0;
  if (["KeyS", "ArrowDown"].includes(e.code) && held.z === 1) held.z = 0;
  syncMove();
});

// 拖曳=朝手指方向移動(手機單指流)
let press = null;
ui.canvas.addEventListener("pointerdown", (e) => {
  if (game.phase === "menu" || game.phase === "done") return;
  audio.unlock();
  press = { x: e.clientX, y: e.clientY };
});
window.addEventListener("pointermove", (e) => {
  if (!press || game.phase !== "escort") return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  const m = Math.hypot(dx, dy);
  if (m > 14) { game.move.x = dx / m; game.move.z = dy / m; }
});
for (const ev of ["pointerup", "pointercancel"]) {
  window.addEventListener(ev, () => { press = null; game.move.x = held.x; game.move.z = held.z; });
}
window.addEventListener("contextmenu", (e) => { if (e.target.closest(".touch-action") || e.target.id === "gameCanvas") e.preventDefault(); });

// 觸控鈕:供養鈕(當前供養)+左右微調
ui.touchRoll.addEventListener("pointerdown", (e) => {
  e.preventDefault(); audio.unlock();
  const key = ["bread", "water", "keep"][game.provIdx] || "bread";
  game.pressProvision(key);
});
let holdL = null, holdR = null;
ui.touchLeft.addEventListener("pointerdown", (e) => { e.preventDefault(); audio.unlock(); holdL = setInterval(() => { game.move.x = -1; }, 40); });
ui.touchRight.addEventListener("pointerdown", (e) => { e.preventDefault(); audio.unlock(); holdR = setInterval(() => { game.move.x = 1; }, 40); });
for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
  ui.touchLeft.addEventListener(ev, () => { clearInterval(holdL); game.move.x = held.x; });
  ui.touchRight.addEventListener(ev, () => { clearInterval(holdR); game.move.x = held.x; });
}

// HUD 鈕
ui.cameraButton.addEventListener("click", () => { audio.uiTap(); game.cycleCamView(); });
ui.menuButton.addEventListener("click", () => {
  audio.uiTap();
  game.phase = "menu";
  ui.homeScreen.classList.add("visible");
  ui.matchOverlay.classList.remove("visible");
  ui.scoreSheet.hidden = true;
  ui.powerPanel.hidden = true;
});
const setAudio = (on) => {
  audioEnabled = on;
  audio.setEnabled(on);
  setVoiceEnabled(on);
  ui.audioButton.textContent = on ? "音效開啟" : "音效靜音";
  persist();
};
ui.audioButton.addEventListener("click", () => setAudio(!audioEnabled));
ui.audioSelect.addEventListener("change", (e) => setAudio(e.target.value === "on"));

function persist() {
  saveSettings({ modeId: "solo", difficulty: selectedDifficulty, frames: selectedFrames, audioEnabled });
}
function syncMenu() {
  ui.difficultySelect.value = selectedDifficulty;
  ui.framesSelect.value = String(selectedFrames);
  ui.audioSelect.value = audioEnabled ? "on" : "off";
}
ui.difficultySelect.addEventListener("change", (e) => { selectedDifficulty = e.target.value; persist(); });
ui.framesSelect.addEventListener("change", (e) => { selectedFrames = Number(e.target.value); persist(); });

ui.startMatchButton.addEventListener("click", () => {
  window.__matchT0 = Date.now();   // -done beacon 用:本局開始時間
  audio.unlock(); audio.uiTap();
  window.psPing?.("obadiah3d-start"); window.__psT0 = Date.now();
  persist();
  game.applyPresentation({ difficulty: selectedDifficulty, frames: selectedFrames });
  ui.homeScreen.classList.remove("visible");
  ui.matchOverlay.classList.remove("visible");
  game.startMatch();
});
ui.overlayReplayButton.addEventListener("click", () => {
  audio.uiTap();
  ui.matchOverlay.classList.remove("visible");
  game.startMatch();
});
ui.overlayMenuButton.addEventListener("click", () => {
  audio.uiTap();
  ui.matchOverlay.classList.remove("visible");
  game.phase = "menu";
  ui.homeScreen.classList.add("visible");
  ui.scoreSheet.hidden = true;
});

const doResize = () => game.resize();
window.addEventListener("resize", doResize);
syncMenu();
doResize();
game.startLoop();
