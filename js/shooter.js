/* ================================================================
   shooter.js — ASCIItron retro ASCII shooter
   Ported from asciitron (lklynet/asciitron) to vanilla JS
   Self-contained IIFE — exposes window.Shooter = { open, close }
   ================================================================ */

(function () {
    "use strict";

    // ── Open state guard ──────────────────────────────────────────
    let isOpen = false;

    // ── Difficulty tuning ─────────────────────────────────────────
    let initialSpawnRate = 0.015;
    let spawnRateIncrease = 1.1;
    let maxSpawnRate = 0.08;
    let initialEnemySpeed = 0.18;
    let enemySpeedIncrease = 1.05;
    let maxEnemySpeed = 0.6;
    let baseBulletSpeed = 0.8;
    let baseStalkerSpeed = 0.05;
    let baseEnemySpeedFactor = 1.0;
    let eliteEnemySpeedFactorIncrease = 1.2;
    let initialStalkerSpawnTime = 45000;
    let stalkerSpawnIntervalTime = 15000;
    let breatherWaveSpawnRateFactor = 0.5;
    let breatherWaveEnemySpeedFactor = 0.8;
    let breatherWaveDuration = 5000;

    const ENEMY_SPEED_FACTORS = { "&": 0.8, "%": 1.2, "#": 1.0 };

    const BOSS_TYPES = {
        TANK: { char: "$$", health: 25, speed: 0.05, points: 20, shootInterval: 3000, ability: "mine" },
        SHOOTER: {
            char: "@@",
            health: 15,
            speed: 0.1,
            points: 20,
            shootInterval: 3000,
            ability: "shoot",
            shieldBullets: [],
            shieldRadius: 3,
            shieldBulletCount: 8,
            rotationSpeed: 0.1,
            lastShieldExplosion: 0,
            shieldExplosionInterval: 5000,
        },
        GHOST: {
            char: "%%",
            health: 20,
            speed: 0.15,
            points: 20,
            spawnInterval: 2000,
            vanishInterval: 3000,
            vanishDuration: 2000,
            ability: "spawn",
            lastVanishTime: 0,
        },
        CHARGE: {
            char: "><",
            health: 20,
            speed: 0.2,
            points: 25,
            chargeInterval: 3000,
            chargeSpeedFactor: 8,
            chargeDistance: 15,
            ability: "charge",
            lastChargeUse: 0,
        },
        SHIELD: {
            char: "[]",
            health: 30,
            speed: 0.08,
            points: 20,
            shieldInterval: 5000,
            shieldDuration: 2000,
            ability: "shield",
            isShielded: false,
            shieldEndTime: 0,
            mineInterval: 2000,
            lastMineShot: 0,
        },
        RAPID_FIRE: {
            char: "==",
            health: 12,
            speed: 0.12,
            points: 20,
            rapidFireInterval: 2000,
            rapidFireDuration: 1500,
            ability: "rapidFire",
            isRapidFiring: false,
            rapidFireEndTime: 0,
            lastRapidFireUse: 0,
        },
        AOE: {
            char: "OO",
            health: 28,
            speed: 0.06,
            points: 20,
            aoeInterval: 7000,
            aoeBulletSpeed: 0.5,
            aoeBulletCount: 12,
            ability: "aoe",
            lastAoeUse: 0,
        },
    };

    // ── Game state ────────────────────────────────────────────────
    let gameState = "start";
    let gameLoop;
    let score = 0;
    let wave = 0;
    let eliteWaveActive = false;
    let lastBossWave = 0;
    let breatherWaveActive = false;
    let breatherWaveEndTime = 0;

    let stalkers = [];
    let stalkerSpawnTime = initialStalkerSpawnTime;
    let stalkerSpawnInterval = stalkerSpawnIntervalTime;
    let lastStalkerSpawn = 0;
    let waveStartTime = 0;

    let player = { x: 40, y: 12, char: "@", dx: 0, dy: 0, shootDx: 0, shootDy: -1 };
    let bullets = [];
    let enemies = [];
    let enemyBullets = [];
    let mines = [];

    let gameWidth = 80;
    let gameHeight = 35;
    let bulletSpeed = baseBulletSpeed;
    let enemySpeed = initialEnemySpeed;
    let spawnRate = initialSpawnRate;
    let stalkerSpeed = baseStalkerSpeed;

    let mineStartWave = 6;
    let initialMineCount = 3;

    // ── Audio ─────────────────────────────────────────────────────
    let audioCtx;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        /* unsupported */
    }

    function playSound(freq, dur, vol = 0.5, type = "sine", detune = 0, cb) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.detune.setValueAtTime(detune, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + dur);
        if (cb) osc.onended = cb;
    }

    function playPlayerShootSound() {
        playSound(240, 0.03, 0.3, "sawtooth");
        playSound(120, 0.1, 0.1, "square", -50);
    }
    function playEnemyHitSound() {
        playSound(440, 0.03, 0.3, "triangle");
        playSound(220, 0.1, 0.1, "square", -50);
    }
    function playEnemyExplosionSound() {
        playSound(110, 0.3, 0.8, "sawtooth", -100);
    }
    function playPlayerDeathSound() {
        playSound(55, 0.6, 1.0, "sawtooth", -500);
    }
    function playStalkerSpawnSound() {
        playSound(60, 2, 0.7, "sawtooth", 50);
    }
    function playBossSpawnSound() {
        playSound(40, 1.5, 1.0, "sawtooth", 100, () => playSound(60, 1, 0.7, "sine", -500));
    }
    function playMineExplosionSound() {
        playSound(220, 0.2, 0.8, "square");
    }

    // ── Game init ─────────────────────────────────────────────────
    function initGame() {
        score = 0;
        wave = 0;
        player.x = 40;
        player.y = 12;
        player.dx = 0;
        player.dy = 0;
        player.shootDx = 0;
        player.shootDy = -1;
        bullets = [];
        enemies = [];
        enemyBullets = [];
        stalkers = [];
        mines = [];
        eliteWaveActive = false;
        lastBossWave = 0;
        breatherWaveActive = false;
        spawnRate = initialSpawnRate;
        enemySpeed = initialEnemySpeed;
        stalkerSpawnTime = initialStalkerSpawnTime;
        stalkerSpawnInterval = stalkerSpawnIntervalTime;
    }

    function spawnMines() {
        if (wave >= mineStartWave) {
            const count = initialMineCount + (wave - mineStartWave);
            for (let i = 0; i < count; i++) {
                mines.push({
                    x: Math.random() * (gameWidth - 2) + 1,
                    y: Math.random() * (gameHeight - 2) + 1,
                    char: "o",
                    health: 3,
                });
            }
        }
    }

    function spawnEnemy(isBoss = false) {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        switch (side) {
            case 0:
                x = Math.random() * gameWidth;
                y = 0;
                break;
            case 1:
                x = gameWidth - 1;
                y = Math.random() * gameHeight;
                break;
            case 2:
                x = Math.random() * gameWidth;
                y = gameHeight - 1;
                break;
            case 3:
                x = 0;
                y = Math.random() * gameHeight;
                break;
        }

        if (isBoss) {
            const bossKeys = Object.keys(BOSS_TYPES);
            const bk = bossKeys[Math.floor(Math.random() * bossKeys.length)];
            const bc = BOSS_TYPES[bk];
            enemies.push({
                x,
                y,
                char: bc.char,
                health: bc.health,
                speed: bc.speed,
                points: bc.points,
                ability: bc.ability,
                isBoss: true,
                lastAbilityUse: Date.now(),
                abilityInterval:
                    bc.shootInterval ||
                    bc.spawnInterval ||
                    bc.chargeInterval ||
                    bc.shieldInterval ||
                    bc.rapidFireInterval ||
                    bc.aoeInterval,
                isInvisible: bc.ability === "spawn" ? false : undefined,
                vanishEndTime: bc.ability === "spawn" ? 0 : undefined,
                lastVanishTime: bc.ability === "spawn" ? Date.now() : undefined,
                isCharging: bc.ability === "charge" ? false : undefined,
                chargeTargetX: undefined,
                chargeTargetY: undefined,
                lastChargeUse: bc.ability === "charge" ? Date.now() : undefined,
                isShielded: bc.ability === "shield" ? false : undefined,
                shieldEndTime: bc.ability === "shield" ? 0 : undefined,
                lastShieldUse: bc.ability === "shield" ? Date.now() : undefined,
                lastMineShot: bc.ability === "shield" ? Date.now() : undefined,
                isRapidFiring: bc.ability === "rapidFire" ? false : undefined,
                rapidFireEndTime: bc.ability === "rapidFire" ? 0 : undefined,
                lastRapidFireUse: bc.ability === "rapidFire" ? Date.now() : undefined,
                aoeBulletSpeed: bc.ability === "aoe" ? BOSS_TYPES.AOE.aoeBulletSpeed : undefined,
                aoeBulletCount: bc.ability === "aoe" ? BOSS_TYPES.AOE.aoeBulletCount : undefined,
                lastAoeUse: bc.ability === "aoe" ? Date.now() : undefined,
                shieldBullets: bc.ability === "shoot" ? [] : undefined,
                lastShieldExplosion: bc.ability === "shoot" ? 0 : undefined,
            });
            playBossSpawnSound();
        } else {
            const et = Math.random() < 0.33 ? "&" : Math.random() < 0.5 ? "%" : "#";
            let sf = ENEMY_SPEED_FACTORS[et] || baseEnemySpeedFactor;
            let ec = et;
            let isElite = false;
            if (eliteWaveActive && Math.random() < 0.4) {
                isElite = true;
                sf *= eliteEnemySpeedFactorIncrease;
                ec = et.toUpperCase();
            }
            enemies.push({
                x,
                y,
                char: ec,
                type: Math.floor(Math.random() * 3),
                health: 1,
                isBoss: false,
                speedFactor: sf,
                isElite,
            });
        }
    }

    function spawnMultipleBosses(waveNumber) {
        const n = Math.floor(waveNumber / 5);
        for (let i = 0; i < n; i++) spawnEnemy(true);
    }

    // ── Main update ───────────────────────────────────────────────
    function updateGame() {
        if (wave === 0) {
            spawnRate = initialSpawnRate * 0.7;
            enemySpeed = initialEnemySpeed * 0.8;
        }

        // Mine collision with player
        for (let i = mines.length - 1; i >= 0; i--) {
            if (Math.abs(player.x - mines[i].x) < 0.8 && Math.abs(player.y - mines[i].y) < 0.8) {
                playPlayerDeathSound();
                endGame();
                return;
            }
        }

        if (breatherWaveActive && Date.now() > breatherWaveEndTime) {
            breatherWaveActive = false;
            eliteWaveActive = true;
            spawnRate = Math.min(maxSpawnRate, spawnRate * spawnRateIncrease);
            enemySpeed = Math.min(maxEnemySpeed, enemySpeed * enemySpeedIncrease);
        }

        const currentSpawnRate = breatherWaveActive ? spawnRate * breatherWaveSpawnRateFactor : spawnRate;
        const currentEnemySpeedBase = breatherWaveActive ? enemySpeed * breatherWaveEnemySpeedFactor : enemySpeed;

        player.x = Math.max(0, Math.min(gameWidth - 1, player.x + player.dx));
        player.y = Math.max(1, Math.min(gameHeight - 1, player.y + player.dy));

        // Player bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            bullets[i].x += bullets[i].dx * bulletSpeed;
            bullets[i].y += bullets[i].dy * bulletSpeed;

            if (bullets[i].x < 0 || bullets[i].x >= gameWidth || bullets[i].y < 0 || bullets[i].y >= gameHeight) {
                bullets.splice(i, 1);
                continue;
            }

            // Bullet vs mines
            for (let j = mines.length - 1; j >= 0; j--) {
                if (Math.abs(bullets[i].x - mines[j].x) < 1 && Math.abs(bullets[i].y - mines[j].y) < 1) {
                    mines[j].health--;
                    bullets.splice(i, 1);
                    playMineExplosionSound();
                    if (mines[j].health <= 0) {
                        const mx = mines[j].x,
                            my = mines[j].y;
                        mines.splice(j, 1);
                        for (let k = enemies.length - 1; k >= 0; k--) {
                            if (Math.abs(enemies[k].x - mx) <= 3 && Math.abs(enemies[k].y - my) <= 3) {
                                score += enemies[k].isBoss ? enemies[k].points : 10;
                                enemies.splice(k, 1);
                            }
                        }
                    }
                    break;
                }
            }

            // Bullet vs enemy mine-bullets
            if (bullets[i]) {
                for (let j = enemyBullets.length - 1; j >= 0; j--) {
                    if (
                        enemyBullets[j].char === "o" &&
                        Math.abs(bullets[i].x - enemyBullets[j].x) < 1 &&
                        Math.abs(bullets[i].y - enemyBullets[j].y) < 1
                    ) {
                        const mx = enemyBullets[j].x,
                            my = enemyBullets[j].y;
                        bullets.splice(i, 1);
                        enemyBullets.splice(j, 1);
                        for (let k = enemies.length - 1; k >= 0; k--) {
                            if (Math.abs(enemies[k].x - mx) <= 3 && Math.abs(enemies[k].y - my) <= 3) {
                                score += enemies[k].isBoss ? enemies[k].points : 10;
                                enemies.splice(k, 1);
                            }
                        }
                        break;
                    }
                }
            }
        }

        // Enemy bullets
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            enemyBullets[i].x += enemyBullets[i].dx * bulletSpeed;
            enemyBullets[i].y += enemyBullets[i].dy * bulletSpeed;
            if (
                enemyBullets[i].x < 0 ||
                enemyBullets[i].x >= gameWidth ||
                enemyBullets[i].y < 0 ||
                enemyBullets[i].y >= gameHeight
            ) {
                enemyBullets.splice(i, 1);
                continue;
            }
            if (Math.abs(player.x - enemyBullets[i].x) < 0.8 && Math.abs(player.y - enemyBullets[i].y) < 0.8) {
                playPlayerDeathSound();
                endGame();
                return;
            }
        }

        // Wave complete?
        if (enemies.length === 0) {
            wave++;
            eliteWaveActive = false;
            mines = [];
            spawnMines();
            enemyBullets = enemyBullets.filter((b) => b.char === "o");

            if (!breatherWaveActive) {
                spawnRate = Math.min(maxSpawnRate, spawnRate * spawnRateIncrease);
                enemySpeed = Math.min(maxEnemySpeed, enemySpeed * enemySpeedIncrease);
            }

            waveStartTime = Date.now();
            stalkers = [];
            stalkerSpawnTime = Math.max(10000, stalkerSpawnTime * 0.95);
            stalkerSpawnInterval = Math.max(5000, stalkerSpawnInterval * 0.95);

            const isBossWave = wave % 5 === 0;
            if (isBossWave) {
                spawnMultipleBosses(wave);
                lastBossWave = wave;
                breatherWaveActive = true;
                breatherWaveEndTime = Date.now() + breatherWaveDuration;
            } else if (wave === lastBossWave + 1) {
                breatherWaveActive = true;
                breatherWaveEndTime = Date.now() + breatherWaveDuration;
                for (let i = 0; i < Math.max(1, Math.floor(wave * breatherWaveSpawnRateFactor)); i++) spawnEnemy();
            } else {
                for (let i = 0; i < wave; i++) spawnEnemy();
            }
        }

        // Stalker spawning
        const currentTime = Date.now();
        if (
            currentTime - waveStartTime >= stalkerSpawnTime &&
            (stalkers.length === 0 || currentTime - lastStalkerSpawn >= stalkerSpawnInterval)
        ) {
            const side = Math.floor(Math.random() * 4);
            let x, y;
            switch (side) {
                case 0:
                    x = Math.random() * gameWidth;
                    y = 0;
                    break;
                case 1:
                    x = gameWidth - 1;
                    y = gameHeight - 1;
                    break;
                case 2:
                    x = Math.random() * gameWidth;
                    y = gameHeight - 1;
                    break;
                case 3:
                    x = 0;
                    y = Math.random() * gameHeight;
                    break;
            }
            stalkers.push({ x, y, char: "Ξ" });
            lastStalkerSpawn = currentTime;
            playStalkerSpawnSound();
        }

        // Move stalkers
        stalkers.forEach((s) => {
            const dx = player.x - s.x,
                dy = player.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            s.x += (dx / dist) * stalkerSpeed;
            s.y += (dy / dist) * stalkerSpeed;
            if (Math.abs(player.x - s.x) < 1 && Math.abs(player.y - s.y) < 0.8) {
                playPlayerDeathSound();
                endGame();
                return;
            }
        });

        // Move enemies + handle bullets/bosses
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (!enemies[i]) continue;

            const dx = player.x - enemies[i].x,
                dy = player.y - enemies[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const curSpeed = currentEnemySpeedBase * (enemies[i].speedFactor || baseEnemySpeedFactor);
            enemies[i].x += (dx / dist) * curSpeed;
            enemies[i].y += (dy / dist) * curSpeed;

            // Bullet vs enemy
            for (let j = bullets.length - 1; j >= 0; j--) {
                if (Math.abs(bullets[j].x - enemies[i].x) < 1 && Math.abs(bullets[j].y - enemies[i].y) < 1) {
                    enemies[i].health--;
                    bullets.splice(j, 1);
                    playEnemyHitSound();
                    if (enemies[i].health <= 0) {
                        if (enemies[i].isBoss && enemies[i].ability === "charge") {
                            enemies.push(
                                {
                                    x: enemies[i].x - 1,
                                    y: enemies[i].y,
                                    char: "<",
                                    health: Math.ceil(BOSS_TYPES.CHARGE.health / 2),
                                    speed: BOSS_TYPES.CHARGE.speed * 1.2,
                                    points: Math.ceil(BOSS_TYPES.CHARGE.points / 2),
                                    isBoss: true,
                                    direction: "left",
                                    ability: "split",
                                },
                                {
                                    x: enemies[i].x + 1,
                                    y: enemies[i].y,
                                    char: ">",
                                    health: Math.ceil(BOSS_TYPES.CHARGE.health / 2),
                                    speed: BOSS_TYPES.CHARGE.speed * 1.2,
                                    points: Math.ceil(BOSS_TYPES.CHARGE.points / 2),
                                    isBoss: true,
                                    direction: "right",
                                    ability: "split",
                                }
                            );
                            score += enemies[i].points;
                            enemies.splice(i, 1);
                        } else {
                            score += enemies[i].isBoss ? enemies[i].points : 10;
                            enemies.splice(i, 1);
                        }
                        break;
                    }
                }
            }

            if (!enemies[i]) continue;

            // Boss abilities
            if (enemies[i].isBoss && Date.now() - enemies[i].lastAbilityUse >= enemies[i].abilityInterval) {
                const boss = enemies[i];
                boss.lastAbilityUse = Date.now();

                switch (boss.ability) {
                    case "shoot":
                        if (!boss.shieldBullets) {
                            boss.shieldBullets = [];
                            boss.lastShieldExplosion = Date.now();
                        }
                        if (boss.shieldBullets.length === 0) {
                            for (let k = 0; k < BOSS_TYPES.SHOOTER.shieldBulletCount; k++) {
                                const angle = (k / BOSS_TYPES.SHOOTER.shieldBulletCount) * 2 * Math.PI;
                                boss.shieldBullets.push({
                                    angle,
                                    x: boss.x + Math.cos(angle) * BOSS_TYPES.SHOOTER.shieldRadius,
                                    y: boss.y + Math.sin(angle) * BOSS_TYPES.SHOOTER.shieldRadius,
                                });
                            }
                        }
                        boss.shieldBullets.forEach((b) => {
                            b.angle += BOSS_TYPES.SHOOTER.rotationSpeed;
                            b.x = boss.x + Math.cos(b.angle) * BOSS_TYPES.SHOOTER.shieldRadius;
                            b.y = boss.y + Math.sin(b.angle) * BOSS_TYPES.SHOOTER.shieldRadius;
                            enemyBullets.push({ x: b.x, y: b.y, dx: 0, dy: 0, char: "*" });
                        });
                        if (currentTime - boss.lastShieldExplosion >= BOSS_TYPES.SHOOTER.shieldExplosionInterval) {
                            boss.lastShieldExplosion = currentTime;
                            boss.shieldBullets.forEach((b) => {
                                const bdx = (b.x - boss.x) / BOSS_TYPES.SHOOTER.shieldRadius;
                                const bdy = (b.y - boss.y) / BOSS_TYPES.SHOOTER.shieldRadius;
                                enemyBullets.push({ x: b.x, y: b.y, dx: bdx, dy: bdy, char: "*" });
                            });
                            boss.shieldBullets = [];
                        }
                        break;

                    case "mine":
                        enemyBullets.push({ x: boss.x, y: boss.y, dx: 0, dy: 0, char: "o" });
                        break;

                    case "spawn":
                        if (!boss.isInvisible && currentTime - boss.lastVanishTime >= BOSS_TYPES.GHOST.vanishInterval) {
                            boss.isInvisible = true;
                            boss.vanishEndTime = currentTime + BOSS_TYPES.GHOST.vanishDuration;
                            boss.lastVanishTime = currentTime;
                        } else if (boss.isInvisible && currentTime > boss.vanishEndTime) {
                            boss.isInvisible = false;
                        }
                        spawnEnemy();
                        break;

                    case "charge":
                        {
                            const cdx = player.x - boss.x,
                                cdy = player.y - boss.y,
                                cd = Math.sqrt(cdx * cdx + cdy * cdy);
                            boss.x += (cdx / cd) * BOSS_TYPES.CHARGE.speed;
                            boss.y += (cdy / cd) * BOSS_TYPES.CHARGE.speed;
                        }
                        break;

                    case "split":
                        {
                            const vd = player.y - boss.y;
                            boss.y += (vd / Math.abs(vd || 1)) * boss.speed;
                            if (boss.direction === "left") {
                                boss.x -= boss.speed;
                                if (boss.x < 0) boss.x = gameWidth - 1;
                            } else {
                                boss.x += boss.speed;
                                if (boss.x >= gameWidth) boss.x = 0;
                            }
                        }
                        break;

                    case "shield":
                        if (!boss.isShielded && currentTime - boss.lastShieldUse >= BOSS_TYPES.SHIELD.shieldInterval) {
                            boss.isShielded = true;
                            boss.shieldEndTime = currentTime + BOSS_TYPES.SHIELD.shieldDuration;
                            boss.lastShieldUse = currentTime;
                        }
                        if (boss.isShielded) {
                            if (currentTime > boss.shieldEndTime) {
                                boss.isShielded = false;
                            } else if (currentTime - boss.lastMineShot >= BOSS_TYPES.SHIELD.mineInterval) {
                                enemyBullets.push({ x: boss.x, y: boss.y, dx: 0, dy: 0, char: "o" });
                                boss.lastMineShot = currentTime;
                            }
                        }
                        break;

                    case "rapidFire":
                        if (
                            !boss.isRapidFiring &&
                            currentTime - boss.lastRapidFireUse >= BOSS_TYPES.RAPID_FIRE.rapidFireInterval
                        ) {
                            boss.isRapidFiring = true;
                            boss.rapidFireEndTime = currentTime + BOSS_TYPES.RAPID_FIRE.rapidFireDuration;
                            boss.lastRapidFireUse = currentTime;
                        }
                        if (boss.isRapidFiring) {
                            if (currentTime > boss.rapidFireEndTime) {
                                boss.isRapidFiring = false;
                            } else {
                                const ba = Math.atan2(player.y - boss.y, player.x - boss.x);
                                [-0.3, -0.15, 0, 0.15, 0.3].forEach((a) => {
                                    enemyBullets.push({
                                        x: boss.x,
                                        y: boss.y,
                                        dx: Math.cos(ba + a),
                                        dy: Math.sin(ba + a),
                                        char: "*",
                                    });
                                });
                            }
                        }
                        break;

                    case "aoe":
                        if (currentTime - boss.lastAoeUse >= BOSS_TYPES.AOE.aoeInterval) {
                            boss.lastAoeUse = currentTime;
                            for (let k = 0; k < BOSS_TYPES.AOE.aoeBulletCount; k++) {
                                const angle = (k / BOSS_TYPES.AOE.aoeBulletCount) * 2 * Math.PI;
                                enemyBullets.push({
                                    x: boss.x,
                                    y: boss.y,
                                    dx: Math.cos(angle) * BOSS_TYPES.AOE.aoeBulletSpeed,
                                    dy: Math.sin(angle) * BOSS_TYPES.AOE.aoeBulletSpeed,
                                    char: "o",
                                });
                            }
                        }
                        break;
                }
            }

            if (!enemies[i]) continue;
            if (Math.abs(player.x - enemies[i].x) < 0.8 && Math.abs(player.y - enemies[i].y) < 0.8) {
                endGame();
                return;
            }
        }

        if (Math.random() < currentSpawnRate) spawnEnemy();
        drawGame();
    }

    // ── Render ────────────────────────────────────────────────────
    function drawGame() {
        const screen = Array(gameHeight)
            .fill()
            .map(() => Array(gameWidth).fill(" "));

        bullets.forEach((b) => {
            const x = Math.floor(b.x),
                y = Math.floor(b.y);
            if (x >= 0 && x < gameWidth && y >= 0 && y < gameHeight)
                screen[y][x] = `<span style="color:var(--game-bullet)">*</span>`;
        });

        enemyBullets.forEach((b) => {
            const x = Math.floor(b.x),
                y = Math.floor(b.y);
            if (x >= 0 && x < gameWidth && y >= 0 && y < gameHeight)
                screen[y][x] = `<span style="color:var(--game-enemy-bullet)">${b.char}</span>`;
        });

        stalkers.forEach((s) => {
            const x = Math.floor(s.x),
                y = Math.floor(s.y);
            if (x >= 0 && x < gameWidth && y >= 0 && y < gameHeight)
                screen[y][x] = `<span style="color:var(--game-stalker);animation:pulse 2s infinite">${s.char}</span>`;
        });

        mines.forEach((m) => {
            const x = Math.floor(m.x),
                y = Math.floor(m.y);
            if (x >= 0 && x < gameWidth && y >= 0 && y < gameHeight)
                screen[y][x] = `<span style="color:var(--game-mine)">${m.char}</span>`;
        });

        enemies.forEach((e) => {
            if (e.isBoss && e.ability === "spawn" && e.isInvisible) return;
            const x = Math.floor(e.x),
                y = Math.floor(e.y);
            if (x >= 0 && x < gameWidth && y >= 0 && y < gameHeight) {
                const colors = ["--game-enemy1", "--game-enemy2", "--game-enemy3"];
                const ci = e.isElite ? 1 : e.type || 0;
                screen[y][x] =
                    e.isBoss && e.isShielded
                        ? `<span style="color:#fc3e38;animation:blink 1s step-end infinite">${e.char}</span>`
                        : `<span style="color:var(${colors[ci]})">${e.char}</span>`;
            }
        });

        const px = Math.floor(player.x),
            py = Math.floor(player.y);
        if (px >= 0 && px < gameWidth && py >= 0 && py < gameHeight)
            screen[py][px] = `<span style="color:var(--game-player)">${player.char}</span>`;

        // Status row (replaces first row)
        const status = `Score: ${score} | Wave: ${wave}`;
        screen[0] = Array(gameWidth).fill(" ");
        const statusEl = `<span class="status-text">${status}</span>`;
        screen[0][0] = statusEl;
        for (let i = 1; i < Math.min(status.length, gameWidth); i++) screen[0][i] = "";

        const gs = document.getElementById("game-screen");
        if (gs) gs.innerHTML = screen.map((row) => row.join("")).join("<br>");
    }

    // ── Start game ────────────────────────────────────────────────
    function startGame() {
        gameState = "playing";
        const mi = document.getElementById("modal-instructions");
        const ms = document.getElementById("modal-stats");
        if (mi) mi.style.display = "none";
        if (ms) ms.style.display = "none";
        const ss = document.getElementById("start-screen");
        const gs = document.getElementById("game-screen");
        if (ss) ss.style.display = "none";
        if (gs) {
            gs.style.display = "block";
            gs.classList.add("playing");
        }
        initGame();
        if (gameLoop) clearInterval(gameLoop);
        gameLoop = setInterval(updateGame, 1000 / 30);
    }

    // ── End game ──────────────────────────────────────────────────
    function endGame() {
        gameState = "end";
        clearInterval(gameLoop);
        gameLoop = null;
        playPlayerDeathSound();

        const hs = parseInt(localStorage.getItem("asciitron-highscore")) || 0;
        const hw = parseInt(localStorage.getItem("asciitron-highwave")) || 0;
        const gp = parseInt(localStorage.getItem("asciitron-games-played")) || 0;
        const ts = parseInt(localStorage.getItem("asciitron-total-score")) || 0;
        let newHS = false;

        if (score > hs) {
            localStorage.setItem("asciitron-highscore", score);
            newHS = true;
        }
        if (wave > hw) localStorage.setItem("asciitron-highwave", wave);
        localStorage.setItem("asciitron-games-played", gp + 1);
        localStorage.setItem("asciitron-total-score", ts + score);

        const gs = document.getElementById("game-screen");
        const es = document.getElementById("end-screen");
        const fs = document.getElementById("final-score");
        const hm = document.getElementById("new-high-score-message");
        if (gs) {
            gs.style.display = "none";
            gs.classList.remove("playing");
        }
        if (fs) fs.textContent = score;
        if (hm) hm.style.display = newHS ? "block" : "none";
        if (es) es.style.display = "flex";
    }

    // ── Restart ───────────────────────────────────────────────────
    function restartGame() {
        const es = document.getElementById("end-screen");
        const ss = document.getElementById("start-screen");
        if (es) es.style.display = "none";
        if (ss) ss.style.display = "block";
        gameState = "start";
        const dhs = document.getElementById("display-high-score");
        if (dhs) dhs.textContent = localStorage.getItem("asciitron-highscore") || "0";
    }

    function showNotification(msg) {
        const n = document.getElementById("game-notification");
        if (!n) return;
        n.textContent = msg;
        n.style.opacity = 1;
        setTimeout(() => {
            n.style.opacity = 0;
        }, 2000);
    }

    // ── Keyboard ──────────────────────────────────────────────────
    document.addEventListener("keydown", (e) => {
        if (!isOpen) return;

        if (gameState === "start") {
            if (e.code === "Space") {
                setTimeout(startGame, 100);
                return;
            }
            if (e.code === "KeyY") {
                const mi = document.getElementById("modal-instructions");
                const ms = document.getElementById("modal-stats");
                if (ms) ms.style.display = "none";
                if (mi) mi.style.display = mi.style.display === "block" ? "none" : "block";
                return;
            }
            if (e.code === "KeyU") {
                const mi = document.getElementById("modal-instructions");
                const ms = document.getElementById("modal-stats");
                if (mi) mi.style.display = "none";
                if (ms) {
                    if (ms.style.display === "block") {
                        ms.style.display = "none";
                        return;
                    }
                    const shs = document.getElementById("stat-highscore");
                    const shw = document.getElementById("stat-highwave");
                    const sgp = document.getElementById("stat-games-played");
                    const sts = document.getElementById("stat-total-score");
                    if (shs) shs.textContent = localStorage.getItem("asciitron-highscore") || "0";
                    if (shw) shw.textContent = localStorage.getItem("asciitron-highwave") || "0";
                    if (sgp) sgp.textContent = localStorage.getItem("asciitron-games-played") || "0";
                    if (sts) sts.textContent = localStorage.getItem("asciitron-total-score") || "0";
                    ms.style.display = "block";
                }
                return;
            }
        }

        if (gameState === "end" && e.code === "KeyR") {
            restartGame();
            return;
        }

        if (gameState === "playing") {
            switch (e.code) {
                case "KeyW":
                    player.dy = -1;
                    break;
                case "KeyS":
                    player.dy = 1;
                    break;
                case "KeyA":
                    player.dx = -1;
                    break;
                case "KeyD":
                    player.dx = 1;
                    break;
                case "ArrowUp":
                    bullets.push({ x: player.x, y: player.y, dx: 0, dy: -1 });
                    playPlayerShootSound();
                    break;
                case "ArrowDown":
                    bullets.push({ x: player.x, y: player.y, dx: 0, dy: 1 });
                    playPlayerShootSound();
                    break;
                case "ArrowLeft":
                    bullets.push({ x: player.x, y: player.y, dx: -1, dy: 0 });
                    playPlayerShootSound();
                    break;
                case "ArrowRight":
                    bullets.push({ x: player.x, y: player.y, dx: 1, dy: 0 });
                    playPlayerShootSound();
                    break;
            }
        }
    });

    document.addEventListener("keyup", (e) => {
        if (!isOpen) return;
        if (gameState === "playing") {
            switch (e.code) {
                case "KeyW":
                case "KeyS":
                    player.dy = 0;
                    break;
                case "KeyA":
                case "KeyD":
                    player.dx = 0;
                    break;
            }
        }
    });

    // ── Open / Close API ──────────────────────────────────────────
    function open() {
        isOpen = true;
        const ov = document.getElementById("shooter-overlay");
        if (ov) ov.classList.add("open");

        // Reset to start screen
        const ss = document.getElementById("start-screen");
        const gs = document.getElementById("game-screen");
        const es = document.getElementById("end-screen");
        const mi = document.getElementById("modal-instructions");
        const ms = document.getElementById("modal-stats");
        if (ss) ss.style.display = "block";
        if (gs) {
            gs.style.display = "none";
            gs.classList.remove("playing");
        }
        if (es) es.style.display = "none";
        if (mi) mi.style.display = "none";
        if (ms) ms.style.display = "none";

        if (gameLoop) {
            clearInterval(gameLoop);
            gameLoop = null;
        }
        gameState = "start";

        const dhs = document.getElementById("display-high-score");
        if (dhs) dhs.textContent = localStorage.getItem("asciitron-highscore") || "0";
    }

    function close() {
        isOpen = false;
        if (gameLoop) {
            clearInterval(gameLoop);
            gameLoop = null;
        }
        gameState = "start";
        const ov = document.getElementById("shooter-overlay");
        if (ov) ov.classList.remove("open");
        const shell = document.getElementById("shell");
        if (shell) shell.classList.remove("hidden");
        setTimeout(() => {
            const input = document.getElementById("cmd-input");
            if (input) input.focus();
        }, 50);
    }

    window.Shooter = { open, close };
})();