/* ================================================================
   tamagotchi.js runs the "Asciigotchi" self-contained game that manages its own DOM, styles via tamagotchi.css
   ================================================================
*/

(function () {
    "use strict";

    // Moods
    const M = {
        unborn: "O",
        hatching: "0",
        happy: "(^-^)",
        sleeping: "(-.-)",
        hungry: "('+)",
        fed: "('o')",
        lonely: "(._.)",
        petted: "('^')",
        dirty: "(-~-)",
        cleaned: "(*v*)",
        hungryAndLonely: "(,_,)",
        hungryAndDirty: "(~_~)",
        lonelyAndDirty: "(;-;)",
        hungryLonelyAndDirty: "(>_<)",
        tired: "(u_u)",
        sick: "(/_\\)",
        dead: "(X_X)",
    };

    // Intervals (seconds)
    const IV = {
        hunger: 18000, // 5 hours
        loneliness: 27000, // 7.5 hours
        dirtiness: 43200, // 12 hours
        health: 36000, // 10 hours
        sleepiness: 57600, // 16 hours
    };

    // Storage
    const NS = "asciigotchi-";

    function save(k, v) {
        localStorage.setItem(NS + k, String(v));
    }

    function load(k) {
        const d = localStorage.getItem(NS + k);
        return d !== null ? Number(d) : undefined;
    }

    function resetAll() {
        ["birthTime", "lastFed", "lastPetted", "lastCleaned", "lastHealthy", "sleepiness"].forEach((k) =>
            localStorage.removeItem(NS + k)
        );
    }

    // Time
    function now() {
        return Math.round(Date.now() / 1000);
    }

    // Need helpers
    function needPct(lastTime, interval) {
        return Math.min(100, Math.floor(((now() - lastTime) / interval) * 100));
    }

    function needsMore(lastTime, interval) {
        return now() - lastTime > interval;
    }

    function isSick(lastFed, lastPetted, lastCleaned) {
        return (
            now() - lastFed > IV.hunger * 5 ||
            now() - lastPetted > IV.loneliness * 4 ||
            now() - lastCleaned > IV.dirtiness * 2.5
        );
    }

    function isDead(lastHealthy) {
        return now() - lastHealthy > IV.health;
    }

    // Inline game state
    function freshState() {
        return {
            birthTime: load("birthTime"),
            lastFed: load("lastFed") || now(),
            lastPetted: load("lastPetted") || now(),
            lastCleaned: load("lastCleaned") || now(),
            lastHealthy: load("lastHealthy") || now(),
            sleepiness: load("sleepiness") || 0,
            lightsOff: false,
            mood: M.unborn,
            age: 0,
            justReceived: false,
            loopId: null,
        };
    }

    let G = freshState();

    // DOM refs (populated on open)
    let $overlay, $pet, $shadow, $age;
    let $hBar, $lBar, $dBar, $sBar;
    let $btnHatch, $btnFeed, $btnPet, $btnClean;
    let $btnLights, $btnReset, $msg;

    // Create overlay DOM (once)
    function ensureDOM() {
        if (document.getElementById("tama-overlay")) return;

        const el = document.createElement("div");
        el.id = "tama-overlay";
        el.innerHTML = `
      <div id="tama-bar">
        <span id="tama-title">// ASCIIGOTCHI v1.0</span>
        <button id="tama-close">[ESC] detach</button>
      </div>
      <div id="tama-body">
        <div id="tama-stats">
          <div class="tama-stat-row">
            <span class="tama-stat-lbl">AGE</span>
            <span id="tama-age">0.0d</span>
          </div>
          <div class="tama-stat-row">
            <span class="tama-stat-lbl">HGR</span>
            <div class="tama-need-track"><div id="tama-h-bar" class="tama-need-fill"></div></div>
          </div>
          <div class="tama-stat-row">
            <span class="tama-stat-lbl">LON</span>
            <div class="tama-need-track"><div id="tama-l-bar" class="tama-need-fill"></div></div>
          </div>
          <div class="tama-stat-row">
            <span class="tama-stat-lbl">DIR</span>
            <div class="tama-need-track"><div id="tama-d-bar" class="tama-need-fill"></div></div>
          </div>
          <div class="tama-stat-row">
            <span class="tama-stat-lbl">SLP</span>
            <div class="tama-need-track"><div id="tama-s-bar" class="tama-need-fill"></div></div>
          </div>
        </div>

        <div id="tama-pet-area">
          <div id="tama-pet"></div>
          <div id="tama-shadow"></div>
        </div>

        <div id="tama-actions">
          <button id="tama-btn-hatch" class="tama-btn primary">HATCH</button>
          <button id="tama-btn-feed" class="tama-btn">FEED</button>
          <button id="tama-btn-pet" class="tama-btn">PET</button>
          <button id="tama-btn-clean" class="tama-btn">CLEAN</button>
        </div>

        <div id="tama-footer">
          <button id="tama-btn-lights" class="tama-btn-sm">LIGHTS OFF</button>
          <button id="tama-btn-reset" class="tama-btn-sm danger">RESET</button>
        </div>

        <div id="tama-msg"></div>
      </div>
    `;
        document.body.appendChild(el);
    }

    function bindRefs() {
        $overlay = document.getElementById("tama-overlay");
        $pet = document.getElementById("tama-pet");
        $shadow = document.getElementById("tama-shadow");
        $age = document.getElementById("tama-age");
        $hBar = document.getElementById("tama-h-bar");
        $lBar = document.getElementById("tama-l-bar");
        $dBar = document.getElementById("tama-d-bar");
        $sBar = document.getElementById("tama-s-bar");
        $btnHatch = document.getElementById("tama-btn-hatch");
        $btnFeed = document.getElementById("tama-btn-feed");
        $btnPet = document.getElementById("tama-btn-pet");
        $btnClean = document.getElementById("tama-btn-clean");
        $btnLights = document.getElementById("tama-btn-lights");
        $btnReset = document.getElementById("tama-btn-reset");
        $msg = document.getElementById("tama-msg");
    }

    // Render
    function render() {
        if (!$overlay) return;

        const ageInDays = G.birthTime ? Math.round(G.age / 86400) : 0;

        // Pet size
        let size;
        if (!G.birthTime || G.mood === M.hatching) {
            size = 4;
        } else if (ageInDays < 5) {
            size = 2;
        } else if (ageInDays < 30) {
            size = Math.min(7, ageInDays * 0.2333);
        } else {
            size = 7;
        }

        $pet.textContent = G.mood;
        $pet.style.fontSize = `${size}rem`;

        // Shadow
        if (!G.birthTime || G.mood === M.hatching) {
            $shadow.style.width = `${size / 3}rem`;
            $shadow.style.height = `${size / 20}rem`;
        } else {
            $shadow.style.width = `${size}rem`;
            $shadow.style.height = `${size / 10}rem`;
        }

        // Age
        $age.textContent = (G.age / 86400).toFixed(1) + "d";

        // Need bars
        if (G.birthTime) {
            const hp = needPct(G.lastFed, IV.hunger);
            const lp = needPct(G.lastPetted, IV.loneliness);
            const dp = needPct(G.lastCleaned, IV.dirtiness);
            const sp = Math.min(100, Math.floor((G.sleepiness / IV.sleepiness) * 100));

            $hBar.style.width = hp + "%";
            $lBar.style.width = lp + "%";
            $dBar.style.width = dp + "%";
            $sBar.style.width = sp + "%";

            $hBar.className = "tama-need-fill" + (hp > 80 ? " critical" : hp > 60 ? " warning" : "");
            $lBar.className = "tama-need-fill" + (lp > 80 ? " critical" : lp > 60 ? " warning" : "");
            $dBar.className = "tama-need-fill" + (dp > 80 ? " critical" : dp > 60 ? " warning" : "");
            $sBar.className = "tama-need-fill" + (sp > 80 ? " critical" : sp > 60 ? " warning" : "");
        }

        // Animation class
        let anim = "tama-alive";
        if (!G.birthTime) anim = "";
        else if (G.mood === M.hatching) anim = "tama-hatching";
        else if (G.mood === M.sleeping) anim = "tama-sleeping";
        else if (G.mood === M.sick) anim = "tama-sick";
        else if (G.mood === M.dead) anim = "tama-dead";
        else if (G.mood === M.fed) anim = "tama-fed";
        else if (G.mood === M.petted) anim = "tama-petted";
        else if (G.mood === M.cleaned) anim = "tama-cleaned";
        $pet.className = anim;

        // Button states
        const isUnborn = !G.birthTime || G.mood === M.hatching;
        const isAlive = G.birthTime && !isDead(G.lastHealthy) && G.mood !== M.dead;

        $btnHatch.style.display = isUnborn ? "" : "none";
        $btnFeed.style.display = isAlive ? "" : "none";
        $btnPet.style.display = isAlive ? "" : "none";
        $btnClean.style.display = isAlive ? "" : "none";

        $btnFeed.disabled = G.justReceived;
        $btnPet.disabled = G.justReceived;
        $btnClean.disabled = G.justReceived;

        $btnLights.textContent = G.lightsOff ? "LIGHTS ON" : "LIGHTS OFF";
        $overlay.classList.toggle("tama-lights-off", G.lightsOff);

        // Status message
        if (G.mood === M.dead) {
            setMsg("(X_X) your pet has passed away", "err");
        } else if (G.mood === M.sick) {
            setMsg("your pet is sick — attend to their needs!", "err");
        } else if (!G.birthTime) {
            setMsg("press HATCH to begin", "");
        } else {
            setMsg("", "");
        }
    }

    function setMsg(text, cls) {
        if (!$msg) return;
        $msg.textContent = text;
        $msg.className = cls ? cls : "";
    }

    // Mood logic
    function calcMood() {
        if (G.justReceived) return;
        if (!G.birthTime) {
            G.mood = M.unborn;
            return;
        }

        G.mood = M.happy;

        const hungry = needsMore(G.lastFed, IV.hunger);
        const lonely = needsMore(G.lastPetted, IV.loneliness);
        const dirty = needsMore(G.lastCleaned, IV.dirtiness);
        const sleepy = G.sleepiness > IV.sleepiness;

        if (hungry) {
            if (lonely && dirty) G.mood = M.hungryLonelyAndDirty;
            else if (lonely) G.mood = M.hungryAndLonely;
            else if (dirty) G.mood = M.hungryAndDirty;
            else G.mood = M.hungry;
        } else if (sleepy) {
            G.mood = M.tired;
        } else if (lonely) {
            G.mood = dirty ? M.lonelyAndDirty : M.lonely;
        } else if (dirty) {
            G.mood = M.dirty;
        } else if (G.lightsOff) {
            G.mood = M.sleeping;
        }

        // Health check
        const sick = isSick(G.lastFed, G.lastPetted, G.lastCleaned) || G.sleepiness > IV.sleepiness * 2;

        if (sick) {
            G.mood = M.sick;
            // don't update lastHealthy (it will tick toward dead)
        } else {
            G.lastHealthy = now();
            save("lastHealthy", G.lastHealthy);
        }

        // Death check
        if (isDead(G.lastHealthy) || Math.round(G.age / 86400) > 365) {
            G.mood = M.dead;
        }
    }

    // Game tick
    function tick() {
        if (!G.birthTime || G.mood === M.dead) {
            render();
            return;
        }

        G.age = now() - G.birthTime;
        G.sleepiness = G.lightsOff ? Math.max(0, G.sleepiness - 3) : G.sleepiness + 1;

        calcMood();

        save("sleepiness", G.sleepiness);
        render();
    }

    // Actions
    function doHatch() {
        if (G.mood === M.hatching) return;
        const n = now();
        G.birthTime = n;
        G.lastFed = n - Math.floor(IV.hunger / 1.4);
        G.lastPetted = n - Math.floor(IV.loneliness / 1.8);
        G.lastCleaned = n - Math.floor(IV.dirtiness / 1.1);
        G.lastHealthy = n - Math.floor(IV.health / 1.1);
        G.sleepiness = 0;
        G.mood = M.hatching;
        G.justReceived = true;

        save("birthTime", G.birthTime);
        save("lastFed", G.lastFed);
        save("lastPetted", G.lastPetted);
        save("lastCleaned", G.lastCleaned);
        save("lastHealthy", G.lastHealthy);
        save("sleepiness", 0);

        render();
        setTimeout(() => {
            G.justReceived = false;
        }, 2000);
    }

    function doAction(moodKey, saveKey) {
        G.mood = M[moodKey];
        G[saveKey] = now();
        save(saveKey, G[saveKey]);
        G.justReceived = true;
        render();
        setTimeout(() => {
            G.justReceived = false;
        }, 2000);
    }

    function doLights() {
        G.lightsOff = !G.lightsOff;
        render();
    }

    function doReset() {
        if (!confirm("Reset your asciigotchi? This cannot be undone.")) return;
        clearInterval(G.loopId);
        resetAll();
        G = freshState();
        G.loopId = setInterval(tick, 1000);
        render();
    }

    // Open / Close
    function open() {
        ensureDOM();
        bindRefs();

        // Bind events (safe to re-bind; handlers are idempotent)
        $btnHatch.onclick = doHatch;
        $btnFeed.onclick = () => doAction("fed", "lastFed");
        $btnPet.onclick = () => doAction("petted", "lastPetted");
        $btnClean.onclick = () => doAction("cleaned", "lastCleaned");
        $btnLights.onclick = doLights;
        $btnReset.onclick = doReset;
        document.getElementById("tama-close").onclick = close;

        // Hide shell, show overlay
        const $shell = document.getElementById("shell");
        if ($shell) $shell.classList.add("hidden");

        // Start game loop
        if (G.loopId) clearInterval(G.loopId);
        G.loopId = setInterval(tick, 1000);

        $overlay.classList.add("open");
        render();
    }

    function close() {
        if (G.loopId) clearInterval(G.loopId);
        G.loopId = null;

        if ($overlay) $overlay.classList.remove("open");

        const $shell = document.getElementById("shell");
        if ($shell) $shell.classList.remove("hidden");

        // Focus input
        const $input = document.getElementById("cmd-input");
        if ($input) $input.focus();
    }

    // Keyboard ESC
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && $overlay && $overlay.classList.contains("open")) {
            close();
        }
    });

    // Export
    window.TamaGotchi = { open, close };
})();