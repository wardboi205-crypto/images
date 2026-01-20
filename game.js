const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const waveEl = document.getElementById("wave");
const healthFill = document.getElementById("healthFill");
const restartButton = document.getElementById("restart");

const playerMaxHealth = 10;

const state = {
  score: 0,
  lives: 3,
  wave: 1,
  running: true,
  bossActive: false,
  health: playerMaxHealth,
};

const player = {
  x: canvas.width / 2,
  y: canvas.height - 70,
  width: 52,
  height: 52,
  speed: 5,
  cooldown: 0,
  image: new Image(),
};

const boss = {
  x: canvas.width / 2,
  y: 120,
  width: 140,
  height: 140,
  hp: 20,
  direction: 1,
  image: new Image(),
  imageIndex: 0,
};

const defaultShooter =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6bf"/><stop offset="1" stop-color="#246"/></linearGradient></defs><polygon points="60,8 98,40 98,96 60,112 22,96 22,40" fill="url(#g)" stroke="#fff" stroke-width="4"/><circle cx="60" cy="60" r="18" fill="#fff"/></svg>'
  );

const defaultBoss =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect x="8" y="24" width="144" height="112" rx="24" fill="#ff5f5f"/><rect x="30" y="50" width="36" height="26" rx="8" fill="#2b193f"/><rect x="94" y="50" width="36" height="26" rx="8" fill="#2b193f"/><rect x="54" y="92" width="52" height="20" rx="8" fill="#2b193f"/></svg>'
  );

player.image.src = defaultShooter;
boss.image.src = defaultBoss;

let audioContext = null;
let audioEnabled = false;

const keys = new Set();
const bullets = [];
const enemyBullets = [];
let invaders = [];
let invaderDirection = 1;
let enemyShootTimer = 0;
let bossShootTimer = 0;
const invaderPalette = ["#4b61ff", "#4cc66d", "#9a6bff", "#e9edf5", "#e04747", "#f3d33b"];
const bossFaceSources = [
  "assets/bosses/boss-1.png",
  "assets/bosses/boss-2.png",
  "assets/bosses/boss-3.png",
  "assets/bosses/boss-4.png",
  "assets/bosses/boss-5.png",
  "assets/bosses/boss-final-glasses.png",
];
const bossFaces = bossFaceSources.map((src) => {
  const image = new Image();
  image.src = src;
  return image;
});

function buildInvaders() {
  const rows = 3 + state.wave;
  const cols = 8;
  const spacingX = 70;
  const spacingY = 50;
  const offsetX = 80;
  const offsetY = 80;
  const formed = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      formed.push({
        x: offsetX + col * spacingX,
        y: offsetY + row * spacingY,
        width: 34,
        height: 26,
        row,
        col,
        alive: true,
      });
    }
  }
  invaderDirection = 1;
  return formed;
}

function resetGame() {
  state.score = 0;
  state.lives = 3;
  state.wave = 1;
  state.running = true;
  state.bossActive = false;
  state.health = playerMaxHealth;
  player.x = canvas.width / 2;
  bullets.length = 0;
  enemyBullets.length = 0;
  boss.hp = 20;
  boss.imageIndex = 0;
  invaders = buildInvaders();
  enemyShootTimer = 0;
  bossShootTimer = 0;
  updateHud();
}

function updateHud() {
  scoreEl.textContent = state.score;
  livesEl.textContent = state.lives;
  waveEl.textContent = state.wave;
  if (healthFill) {
    const healthPercent = Math.max(0, (state.health / playerMaxHealth) * 100);
    healthFill.style.width = `${healthPercent}%`;
  }
}

function spawnBoss() {
  state.bossActive = true;
  boss.x = canvas.width / 2;
  boss.y = 120;
  boss.hp = 20 + state.wave * 4;
  boss.imageIndex = getBossIndexForWave();
  enemyBullets.length = 0;
  bossShootTimer = 0;
  enemyShootTimer = 0;
}

function getBossIndexForWave() {
  if (bossFaces.length === 0) {
    return 0;
  }
  return Math.min(state.wave - 1, bossFaces.length - 1);
}

function ensureAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  audioEnabled = true;
}

function playTone({ frequency, duration, type = "sine", gain = 0.15 }) {
  if (!audioEnabled || !audioContext) {
    return;
  }
  const osc = audioContext.createOscillator();
  const amp = audioContext.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  amp.gain.value = gain;
  osc.connect(amp);
  amp.connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + duration);
}

function playShotSound() {
  playTone({ frequency: 620, duration: 0.08, type: "square", gain: 0.1 });
}

function playEnemyShotSound() {
  playTone({ frequency: 380, duration: 0.1, type: "sawtooth", gain: 0.08 });
}

function playInvaderPopSound() {
  playTone({ frequency: 520, duration: 0.12, type: "triangle", gain: 0.12 });
}

function playBossExplosionSound() {
  playTone({ frequency: 160, duration: 0.25, type: "sawtooth", gain: 0.2 });
}

function handleInput() {
  if (keys.has("ArrowLeft")) {
    player.x -= player.speed;
  }
  if (keys.has("ArrowRight")) {
    player.x += player.speed;
  }
  if (keys.has(" ") && player.cooldown <= 0) {
    ensureAudio();
    bullets.push({ x: player.x, y: player.y - 30, speed: 8 });
    player.cooldown = 20;
    playShotSound();
  }
  player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, player.x));
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    bullets[i].y -= bullets[i].speed;
    if (bullets[i].y < -20) {
      bullets.splice(i, 1);
    }
  }
}

function updateEnemyBullets() {
  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    enemyBullets[i].x += enemyBullets[i].dx;
    enemyBullets[i].y += enemyBullets[i].dy;
    if (enemyBullets[i].y > canvas.height + 30 || enemyBullets[i].x < -30 || enemyBullets[i].x > canvas.width + 30) {
      enemyBullets.splice(i, 1);
    }
  }
}

function updateInvaders() {
  let hitEdge = false;
  invaders.forEach((invader) => {
    if (!invader.alive) {
      return;
    }
    invader.x += invaderDirection * 1.2;
    if (invader.x > canvas.width - 40 || invader.x < 40) {
      hitEdge = true;
    }
  });

  if (hitEdge) {
    invaderDirection *= -1;
    invaders.forEach((invader) => {
      invader.y += 14;
    });
  }
}

function spawnEnemyShot() {
  const aliveInvaders = invaders.filter((invader) => invader.alive);
  if (aliveInvaders.length === 0) {
    return;
  }
  const shooter = aliveInvaders[Math.floor(Math.random() * aliveInvaders.length)];
  enemyBullets.push({
    x: shooter.x,
    y: shooter.y + 10,
    dx: 0,
    dy: 4.2,
  });
  playEnemyShotSound();
}

function spawnBossShot() {
  const spread = [-2.5, -0.8, 0.8, 2.5];
  spread.forEach((dx) => {
    enemyBullets.push({
      x: boss.x,
      y: boss.y + boss.height / 2 - 10,
      dx,
      dy: 4.5,
    });
  });
  playEnemyShotSound();
}

function checkCollisions() {
  bullets.forEach((bullet, bulletIndex) => {
    invaders.forEach((invader) => {
      if (!invader.alive) {
        return;
      }
      if (
        bullet.x > invader.x - invader.width / 2 &&
        bullet.x < invader.x + invader.width / 2 &&
        bullet.y > invader.y - invader.height / 2 &&
        bullet.y < invader.y + invader.height / 2
      ) {
        invader.alive = false;
        bullets.splice(bulletIndex, 1);
        state.score += 50;
        playInvaderPopSound();
      }
    });

    if (state.bossActive) {
      const inBoss =
        bullet.x > boss.x - boss.width / 2 &&
        bullet.x < boss.x + boss.width / 2 &&
        bullet.y > boss.y - boss.height / 2 &&
        bullet.y < boss.y + boss.height / 2;
      if (inBoss) {
        bullets.splice(bulletIndex, 1);
        boss.hp -= 1;
        state.score += 150;
      }
    }
  });

  invaders.forEach((invader) => {
    if (!invader.alive) {
      return;
    }
    if (invader.y > canvas.height - 140) {
      state.lives -= 1;
      invader.alive = false;
    }
  });

  enemyBullets.forEach((bullet, bulletIndex) => {
    const hitPlayer =
      bullet.x > player.x - player.width / 2 &&
      bullet.x < player.x + player.width / 2 &&
      bullet.y > player.y - player.height / 2 &&
      bullet.y < player.y + player.height / 2;
    if (hitPlayer) {
      enemyBullets.splice(bulletIndex, 1);
      state.health -= 1;
      if (state.health <= 0) {
        state.lives -= 1;
        state.health = playerMaxHealth;
      }
    }
  });

  if (state.bossActive && boss.hp <= 0) {
    state.score += 1000;
    state.wave += 1;
    state.bossActive = false;
    invaders = buildInvaders();
    enemyBullets.length = 0;
    bossShootTimer = 0;
    enemyShootTimer = 0;
    state.health = playerMaxHealth;
    playBossExplosionSound();
  }

  if (invaders.every((invader) => !invader.alive) && !state.bossActive) {
    spawnBoss();
  }

  if (state.lives <= 0) {
    state.running = false;
  }
}

function drawBackground() {
  ctx.fillStyle = "#060814";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  for (let i = 0; i < 40; i += 1) {
    ctx.fillRect((i * 97) % canvas.width, (i * 59) % canvas.height, 2, 2);
  }
}

function drawPlayer() {
  ctx.drawImage(
    player.image,
    player.x - player.width / 2,
    player.y - player.height / 2,
    player.width,
    player.height
  );
}

function drawInvaders() {
  invaders.forEach((invader) => {
    if (!invader.alive) {
      return;
    }
    const colorIndex = (invader.row + invader.col) % invaderPalette.length;
    drawInvaderSprite(invader.x, invader.y, invader.width, invader.height, invaderPalette[colorIndex]);
  });
}

function drawInvaderSprite(centerX, centerY, width, height, color) {
  const pixel = Math.min(width / 8, height / 7);
  const spriteWidth = pixel * 8;
  const spriteHeight = pixel * 7;
  const startX = centerX - spriteWidth / 2;
  const startY = centerY - spriteHeight / 2;
  const pattern = [
    "00111100",
    "01111110",
    "11111111",
    "11011011",
    "11111111",
    "01100110",
    "11000011",
  ];

  ctx.fillStyle = color;
  pattern.forEach((row, rowIndex) => {
    [...row].forEach((cell, colIndex) => {
      if (cell === "1") {
        ctx.fillRect(startX + colIndex * pixel, startY + rowIndex * pixel, pixel, pixel);
      }
    });
  });
}

function drawBoss() {
  if (!state.bossActive) {
    return;
  }
  const activeImage = bossFaces[boss.imageIndex] || boss.image;
  drawBossPortrait(activeImage, boss.x, boss.y, boss.width, boss.height);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(boss.x - 50, boss.y + 80, 100, 8);
  ctx.fillStyle = "#6eff8b";
  ctx.fillRect(boss.x - 50, boss.y + 80, (boss.hp / (20 + state.wave * 4)) * 100, 8);
}

function drawBossPortrait(image, centerX, centerY, width, height) {
  const portrait = image && image.complete ? image : boss.image;
  if (!portrait || !portrait.complete) {
    return;
  }
  const sourceSize = Math.min(portrait.width, portrait.height);
  const sourceX = (portrait.width - sourceSize) / 2;
  const sourceY = (portrait.height - sourceSize) * 0.2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, width / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(
    portrait,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    centerX - width / 2,
    centerY - height / 2,
    width,
    height
  );
  ctx.restore();
}

function drawBullets() {
  ctx.fillStyle = "#fef08a";
  bullets.forEach((bullet) => {
    ctx.fillRect(bullet.x - 2, bullet.y - 10, 4, 12);
  });
}

function drawEnemyBullets() {
  ctx.fillStyle = "#ff8b8b";
  enemyBullets.forEach((bullet) => {
    ctx.fillRect(bullet.x - 3, bullet.y - 6, 6, 12);
  });
}

function drawGameOver() {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "40px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 20);
  ctx.font = "20px sans-serif";
  ctx.fillText("Press Restart to play again", canvas.width / 2, canvas.height / 2 + 20);
}

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  if (state.running) {
    handleInput();
    updateBullets();
    updateEnemyBullets();
    updateInvaders();
    if (state.bossActive) {
      boss.x += boss.direction * 1.8;
      if (boss.x > canvas.width - 80 || boss.x < 80) {
        boss.direction *= -1;
      }
    }
    if (player.cooldown > 0) {
      player.cooldown -= 1;
    }
    if (enemyShootTimer <= 0 && invaders.some((invader) => invader.alive)) {
      spawnEnemyShot();
      enemyShootTimer = Math.max(40, 100 - state.wave * 6);
    } else {
      enemyShootTimer -= 1;
    }
    if (state.bossActive) {
      if (bossShootTimer <= 0) {
        spawnBossShot();
        bossShootTimer = 45;
      } else {
        bossShootTimer -= 1;
      }
    }
    checkCollisions();
    updateHud();
  }

  drawBullets();
  drawEnemyBullets();
  drawInvaders();
  drawBoss();
  drawPlayer();

  if (!state.running) {
    drawGameOver();
  }

  requestAnimationFrame(gameLoop);
}

restartButton.addEventListener("click", () => {
  resetGame();
});

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
  }
  keys.add(event.key);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});

resetGame();
requestAnimationFrame(gameLoop);
