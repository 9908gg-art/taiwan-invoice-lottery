/* ==========================================================================
   統一發票對獎器 - 互動、對獎與相機掃描邏輯 (app.js)
   ========================================================================== */

let winningData = null;
let historyRecords = [];
let html5Qrcode = null;

// 音效播放器 (Synthesized Arcade Audio using Web Audio API)
const audioSynth = {
    ctx: null,
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playWin() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        // Play arcade chime (C5 -> E5 -> G5 -> C6)
        const now = this.ctx.currentTime;
        osc.type = "sine";
        
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.3); // C6
        
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        
        osc.start(now);
        osc.stop(now + 0.5);
    },
    playMatch() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        // Play quick double beep
        const now = this.ctx.currentTime;
        osc.type = "square";
        
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        osc.frequency.setValueAtTime(1200, now + 0.08);
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.setValueAtTime(0, now + 0.06);
        gain.gain.setValueAtTime(0.1, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        
        osc.start(now);
        osc.stop(now + 0.2);
    },
    playLose() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        // Play low dry click
        const now = this.ctx.currentTime;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(120, now);
        
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        
        osc.start(now);
        osc.stop(now + 0.15);
    }
};

// Canvas Confetti Effect
const confetti = {
    canvas: null,
    ctx: null,
    particles: [],
    active: false,
    init() {
        this.canvas = document.getElementById("confetti-canvas");
        this.ctx = this.canvas.getContext("2d");
        this.resize();
        window.addEventListener("resize", () => this.resize());
    },
    resize() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    },
    start() {
        this.init();
        this.particles = [];
        this.active = true;
        const colors = ["#f43f5e", "#10b981", "#38bdf8", "#fbbf24", "#d946ef"];
        for (let i = 0; i < 100; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height - this.canvas.height,
                r: Math.random() * 6 + 4,
                d: Math.random() * this.canvas.height,
                color: colors[Math.floor(Math.random() * colors.length)],
                tilt: Math.random() * 10 - 5,
                tiltAngleIncremental: Math.random() * 0.07 + 0.02,
                tiltAngle: 0
            });
        }
        this.draw();
    },
    draw() {
        if (!this.active) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        let remaining = false;
        
        this.particles.forEach(p => {
            p.tiltAngle += p.tiltAngleIncremental;
            p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
            p.x += Math.sin(p.tiltAngle);
            p.tilt = Math.sin(p.tiltAngle - p.r / 2) * 15;
            
            if (p.y < this.canvas.height) {
                remaining = true;
            }
            
            this.ctx.beginPath();
            this.ctx.lineWidth = p.r;
            this.ctx.strokeStyle = p.color;
            this.ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
            this.ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
            this.ctx.stroke();
        });
        
        if (remaining) {
            requestAnimationFrame(() => this.draw());
        } else {
            this.active = false;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
};

document.addEventListener("DOMContentLoaded", () => {
    // 1. 初始化資料加載
    loadWinningNumbers();

    // 2. 初始化本地歷史紀錄
    loadHistory();

    // 3. 切換對獎模式
    initModeToggles();

    // 4. 對獎邏輯監聽
    initChecker();
});

/**
 * 載入中獎號碼 JSON
 */
async function loadWinningNumbers() {
    try {
        const response = await fetch("data/winning_numbers.json");
        if (!response.ok) throw new Error("加載中獎號碼失敗");
        winningData = await response.json();
        
        // 渲染畫面上的號碼
        document.getElementById("data-period").textContent = winningData.period;
        document.getElementById("data-update-time").textContent = winningData.last_updated;
        
        document.getElementById("num-super").textContent = winningData.super_prize;
        document.getElementById("num-grand").textContent = winningData.grand_prize;
        
        const firstContainer = document.getElementById("num-first-container");
        firstContainer.innerHTML = "";
        winningData.first_prizes.forEach(num => {
            const div = document.createElement("div");
            div.className = "award-val";
            div.textContent = num;
            firstContainer.appendChild(div);
        });
    } catch (e) {
        console.error("載入失敗：", e);
        document.getElementById("data-period").innerHTML = `<span style="color: var(--color-red);">無法同步中獎資料</span>`;
    }
}

/**
 * 切換對獎模式按鈕
 */
function initModeToggles() {
    const btnScan = document.getElementById("btn-mode-scan");
    const btnRapid = document.getElementById("btn-mode-rapid");
    const btnFull = document.getElementById("btn-mode-full");
    
    const secScan = document.getElementById("section-scan");
    const secRapid = document.getElementById("section-rapid");
    const secFull = document.getElementById("section-full");

    btnScan.addEventListener("click", () => {
        setModeActive(btnScan, secScan);
        resetResultDisplay();
    });

    btnRapid.addEventListener("click", () => {
        setModeActive(btnRapid, secRapid);
        stopScanner();
        resetResultDisplay();
    });

    btnFull.addEventListener("click", () => {
        setModeActive(btnFull, secFull);
        stopScanner();
        resetResultDisplay();
    });

    function setModeActive(activeBtn, activeSec) {
        [btnScan, btnRapid, btnFull].forEach(btn => btn.classList.remove("active"));
        [secScan, secRapid, secFull].forEach(sec => sec.classList.remove("active"));
        activeBtn.classList.add("active");
        activeSec.classList.add("active");
    }
}

/**
 * 初始化對獎邏輯與相機掃描
 */
function initChecker() {
    const inputRapid = document.getElementById("input-rapid");
    const inputFull = document.getElementById("input-full");
    const btnCheckFull = document.getElementById("btn-check-full");
    const btnClearFull = document.getElementById("btn-clear-full");
    const btnClearHistory = document.getElementById("btn-clear-history");
    
    const btnStartScan = document.getElementById("btn-start-scan");
    const btnStopScan = document.getElementById("btn-stop-scan");

    // 相機啟動與停止監聽
    btnStartScan.addEventListener("click", () => startScanner());
    btnStopScan.addEventListener("click", () => stopScanner());

    // 末三碼快速輸入監聽
    inputRapid.addEventListener("input", () => {
        inputRapid.value = inputRapid.value.replace(/\D/g, "");
        const val = inputRapid.value;
        const resultBox = document.getElementById("rapid-result-box");
        const resultMsg = document.getElementById("rapid-result-msg");

        if (val.length < 3) {
            resultBox.className = "rapid-hint-box";
            resultMsg.textContent = "請輸入 3 位數字進行對獎";
            resetResultDisplay();
            return;
        }

        if (val.length === 3) {
            checkRapidNumber(val);
        }
    });

    // 完整8位數對獎按鈕
    btnCheckFull.addEventListener("click", () => {
        const val = inputFull.value.trim();
        if (val.length !== 8) {
            alert("請輸入完整 8 位數發票號碼");
            return;
        }
        checkFullNumber(val);
    });

    // 8位數 Enter 鍵監聽
    inputFull.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            const val = inputFull.value.trim();
            if (val.length === 8) {
                checkFullNumber(val);
            }
        }
    });

    inputFull.addEventListener("input", () => {
        inputFull.value = inputFull.value.replace(/\D/g, "");
    });

    // 8位數清除
    btnClearFull.addEventListener("click", () => {
        inputFull.value = "";
        resetResultDisplay();
    });

    // 清除歷史紀錄
    btnClearHistory.addEventListener("click", () => {
        if (confirm("確認要清除所有歷史對獎紀錄嗎？")) {
            historyRecords = [];
            localStorage.removeItem("tw_invoice_history");
            renderHistory();
        }
    });
}

/**
 * 啟動相機 QR Code 掃描器
 */
function startScanner() {
    const btnStart = document.getElementById("btn-start-scan");
    const btnStop = document.getElementById("btn-stop-scan");
    const scanBox = document.getElementById("scan-result-box");
    const scanMsg = document.getElementById("scan-result-msg");

    scanBox.className = "rapid-hint-box";
    scanMsg.textContent = "正在啟動相機鏡頭...";

    if (!html5Qrcode) {
        html5Qrcode = new Html5Qrcode("reader");
    }

    const config = { fps: 10, qrbox: { width: 220, height: 220 } };

    html5Qrcode.start(
        { facingMode: "environment" }, // 使用手機後置鏡頭
        config,
        (decodedText) => {
            // 掃描成功回呼
            handleScannedText(decodedText);
        },
        (errorMessage) => {
            // 掃描中 (每幀沒掃到會輸出錯誤，這裡不打印以維持流暢)
        }
    ).then(() => {
        btnStart.style.display = "none";
        btnStop.style.display = "inline-flex";
        scanMsg.innerHTML = `<span style="color: var(--color-accent);"><i class="fa-solid fa-spinner fa-spin"></i> 鏡頭對焦中...請掃描左側 QR Code</span>`;
    }).catch(err => {
        console.error("相機啟動失敗：", err);
        scanMsg.innerHTML = `<span style="color: var(--color-red);"><i class="fa-solid fa-triangle-exclamation"></i> 相機開啟失敗，請確認是否給予相機權限</span>`;
    });
}

/**
 * 關閉相機
 */
function stopScanner() {
    const btnStart = document.getElementById("btn-start-scan");
    const btnStop = document.getElementById("btn-stop-scan");
    const scanMsg = document.getElementById("scan-result-msg");

    if (html5Qrcode && html5Qrcode.isScanning) {
        html5Qrcode.stop().then(() => {
            btnStart.style.display = "inline-flex";
            btnStop.style.display = "none";
            scanMsg.textContent = "相機已關閉";
        }).catch(err => {
            console.error("停止相機失敗：", err);
        });
    }
}

/**
 * 解析發票 QR Code 文字
 * 台灣電子發票格式例如: AB123456781040715... (前兩碼英文 + 8碼數字 + 7碼民國日期)
 */
function handleScannedText(text) {
    const scanBox = document.getElementById("scan-result-box");
    const scanMsg = document.getElementById("scan-result-msg");

    // 更寬鬆的正則匹配：尋找任意處出現的 2 位英文字母 + 8 位數字 (不限大小寫，不限開頭)
    const invoiceRegex = /([A-Za-z]{2})(\d{8})/;
    const match = text.match(invoiceRegex);

    if (match) {
        const fullInvoiceNumber = match[1].toUpperCase() + match[2];
        const invoiceDigits = match[2]; // 8位數字部分
        
        // 手機震動反饋
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }

        // 停止掃描避免重複觸發
        stopScanner();

        scanBox.className = "rapid-hint-box match";
        scanMsg.innerHTML = `<span style="color: var(--color-green); font-weight:700;">✅ 成功對獎發票：${fullInvoiceNumber}</span>`;

        // 執行完全對獎
        checkFullNumber(invoiceDigits, fullInvoiceNumber);
    } else {
        // 提示使用者掃描到的文字內容，方便除錯
        const previewText = text.length > 25 ? text.substring(0, 22) + "..." : text;
        scanMsg.innerHTML = `<span style="color: #fbbf24;"><i class="fa-solid fa-triangle-exclamation"></i> 格式不符。掃描到：「${previewText}」<br>(請對準發票左側的 QR Code)</span>`;
    }
}

/**
 * 重置對獎結果顯示
 */
function resetResultDisplay() {
    const iconBox = document.getElementById("result-status-icon");
    const title = document.getElementById("result-title");
    const desc = document.getElementById("result-desc");
    const badge = document.getElementById("result-prize-badge");

    iconBox.className = "result-icon-box";
    iconBox.innerHTML = `<i class="fa-solid fa-receipt"></i>`;
    title.textContent = "等待對獎";
    desc.textContent = "請選擇上方相機掃描或手動對獎";
    badge.style.display = "none";
}

/**
 * 進行末三碼快速對獎
 */
function checkRapidNumber(threeDigits) {
    if (!winningData) return;

    const resultBox = document.getElementById("rapid-result-box");
    const resultMsg = document.getElementById("rapid-result-msg");

    const superLast3 = winningData.super_prize.slice(-3);
    const grandLast3 = winningData.grand_prize.slice(-3);
    const firstLast3List = winningData.first_prizes.map(num => num.slice(-3));

    let matched = false;
    let matchType = "";

    if (threeDigits === superLast3) {
        matched = true;
        matchType = "特別獎末 3 碼符合！";
    } else if (threeDigits === grandLast3) {
        matched = true;
        matchType = "特獎末 3 碼符合！";
    } else {
        const foundIdx = firstLast3List.indexOf(threeDigits);
        if (foundIdx !== -1) {
            matched = true;
            matchType = "頭獎末 3 碼符合！";
        }
    }

    if (matched) {
        audioSynth.playMatch();
        resultBox.className = "rapid-hint-box match";
        resultMsg.innerHTML = `<span style="color: var(--color-red); font-weight: 700;">🎉 ${matchType} 可能中大獎！請按切換為「8碼精確輸入」驗證！</span>`;

        updateResultDisplay(true, "可能中獎！", `末 3 碼「${threeDigits}」與中獎號碼相符，請輸入完整 8 位數以確認最終獎項與金額。`, null);
    } else {
        audioSynth.playLose();
        resultBox.className = "rapid-hint-box no-match";
        resultMsg.textContent = "❌ 末 3 碼不符，此張發票未中獎";
        
        updateResultDisplay(false, "未中獎", `末 3 碼「${threeDigits}」不相符。`, 0);
        
        addHistoryRecord(threeDigits + " (末3碼)", "未中獎", 0);
    }
}

/**
 * 進行完整8位數精確對獎
 * @param {string} eightDigits 8位數字部分
 * @param {string} optionalFullName 發票完整名稱(含英文前綴)，可用於歷史紀錄
 */
function checkFullNumber(eightDigits, optionalFullName = "") {
    if (!winningData) return;

    let won = false;
    let prizeName = "未中獎";
    let amount = 0;
    const displayName = optionalFullName || eightDigits;

    // 1. 特別獎 (1000萬)
    if (eightDigits === winningData.super_prize) {
        won = true;
        prizeName = "特別獎";
        amount = 10000000;
    }
    // 2. 特獎 (200萬)
    else if (eightDigits === winningData.grand_prize) {
        won = true;
        prizeName = "特獎";
        amount = 2000000;
    }
    // 3. 頭獎與各尾數獎
    else {
        winningData.first_prizes.forEach(firstNum => {
            if (eightDigits === firstNum) {
                won = true;
                prizeName = "頭獎";
                amount = 200000;
            } else if (eightDigits.slice(-7) === firstNum.slice(-7)) {
                if (amount < 40000) { won = true; prizeName = "二獎"; amount = 40000; }
            } else if (eightDigits.slice(-6) === firstNum.slice(-6)) {
                if (amount < 10000) { won = true; prizeName = "三獎"; amount = 10000; }
            } else if (eightDigits.slice(-5) === firstNum.slice(-5)) {
                if (amount < 4000) { won = true; prizeName = "四獎"; amount = 4000; }
            } else if (eightDigits.slice(-4) === firstNum.slice(-4)) {
                if (amount < 1000) { won = true; prizeName = "五獎"; amount = 1000; }
            } else if (eightDigits.slice(-3) === firstNum.slice(-3)) {
                if (amount < 200) { won = true; prizeName = "六獎"; amount = 200; }
            }
        });
    }

    if (won) {
        audioSynth.playWin();
        confetti.start();
        updateResultDisplay(true, `中獎了！恭喜獲得【${prizeName}】`, `發票號碼：${displayName}，獎金金額為 NT$ ${amount.toLocaleString()} 元。`, amount);
        addHistoryRecord(displayName, `${prizeName}`, amount);
    } else {
        audioSynth.playLose();
        updateResultDisplay(false, "未中獎", `發票號碼：${displayName}。再接再厲！`, 0);
        addHistoryRecord(displayName, "未中獎", 0);
    }
}

/**
 * 更新結果顯示面板
 */
function updateResultDisplay(isWin, titleText, descText, amount) {
    const iconBox = document.getElementById("result-status-icon");
    const title = document.getElementById("result-title");
    const desc = document.getElementById("result-desc");
    const badge = document.getElementById("result-prize-badge");

    if (isWin) {
        iconBox.className = "result-icon-box win";
        iconBox.innerHTML = `<i class="fa-solid fa-gift"></i>`;
        title.textContent = titleText;
        title.style.color = "var(--color-red)";
        desc.textContent = descText;
        
        if (amount !== null) {
            badge.style.display = "inline-block";
            badge.textContent = `NT$ ${amount.toLocaleString()} 元`;
        } else {
            badge.style.display = "none";
        }
    } else {
        iconBox.className = "result-icon-box lose";
        iconBox.innerHTML = `<i class="fa-solid fa-face-frown"></i>`;
        title.textContent = titleText;
        title.style.color = "var(--text-primary)";
        desc.textContent = descText;
        badge.style.display = "none";
    }
}

/**
 * 載入並渲染歷史紀錄
 */
function loadHistory() {
    const saved = localStorage.getItem("tw_invoice_history");
    if (saved) {
        try {
            historyRecords = JSON.parse(saved);
        } catch (e) {
            historyRecords = [];
        }
    }
    renderHistory();
}

/**
 * 增加一筆歷史紀錄
 */
function addHistoryRecord(number, status, prizeAmount) {
    // 避免重複加入
    if (historyRecords.some(r => r.number === number)) return;

    historyRecords.unshift({
        number: number,
        status: status,
        amount: prizeAmount,
        time: new Date().toLocaleTimeString()
    });

    if (historyRecords.length > 30) {
        historyRecords.pop();
    }

    localStorage.setItem("tw_invoice_history", JSON.stringify(historyRecords));
    renderHistory();
}

/**
 * 渲染歷史紀錄表格與彙整
 */
function renderHistory() {
    const tbody = document.getElementById("history-list-body");
    const totalCount = document.getElementById("history-total-count");
    const winAmount = document.getElementById("history-win-amount");

    if (!tbody) return;

    tbody.innerHTML = "";

    let totalChecked = historyRecords.length;
    let totalWin = historyRecords.reduce((acc, cur) => acc + cur.amount, 0);

    totalCount.textContent = totalChecked;
    winAmount.textContent = totalWin.toLocaleString();

    if (historyRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center" style="color: var(--text-muted);">尚無對獎紀錄</td></tr>`;
        return;
    }

    historyRecords.forEach(record => {
        const tr = document.createElement("tr");
        const statusColor = record.amount > 0 ? "val-red" : "val-neutral";
        
        tr.innerHTML = `
            <td style="font-family: 'Outfit', sans-serif;">${record.number}</td>
            <td class="${statusColor}" style="font-weight: 500;">${record.status}</td>
            <td class="text-right ${statusColor}" style="font-family: 'Outfit', sans-serif;">$ ${record.amount.toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
}
