const { Telegraf } = require("telegraf")
const axios = require("axios")
const express = require("express")

// ---------------- CONFIG ----------------
const BOT_TOKEN = "8662246376:AAEVIjYsJzB1Zvhw4_hZk5E3injCNsV3h9g"
const PREDICTION_CHANNEL = "-1003750181011"
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=150"

const bot = new Telegraf(BOT_TOKEN)

let historyData = [] // Max 150 latest records
let lastIssue = ""
let lastMsgId = null
let lastPredictionData = null

// Sticker IDs
const WIN_STICKER = "CAACAgUAAxkBAAFE9FtpuAQsz_OSJEL23Mxjo-Ox-VJD9AACnRUAAjCBqVTN3Vho3FjTQjoE"
const LOSS_STICKER = "CAACAgIAAxkBAAFE9GtpuAS8nPYwxKSN3ixuq4a3PKyOCgACNAADWbv8JWBOiTxAs-8HOgQ"

// ---------------- CORE ENGINE ----------------

function getFinalPrediction(nextIssue) {
    const targetDigit = nextIssue.slice(-1); // Step 2: Last digit of next period
    
    // Step 3: Filter System (Latest 11 entries with same last digit)
    const filtered = historyData
        .filter(item => item.issue.slice(-1) === targetDigit)
        .slice(0, 11);

    if (filtered.length === 0) return null;

    const nums = filtered.map(item => item.number);
    
    // Step 5: Count System
    let counts = { big: 0, small: 0, red: 0, green: 0 };
    nums.forEach(n => {
        if (n >= 5) counts.big++; else counts.small++;
        if ([0, 2, 4, 6, 8].includes(n)) counts.red++; else counts.green++;
    });

    // Step 6: Rule Apply (Identify Strong & Support)
    // Strong checking
    let strongType = (counts.big >= counts.small) ? "BIG" : "SMALL";
    let supportType = (counts.red >= counts.green) ? "RED" : "GREEN";

    // Step 7: Final Number Selection (Intersection)
    const redNums = [0, 2, 4, 6, 8];
    const greenNums = [1, 3, 5, 7, 9];
    const bigNums = [5, 6, 7, 8, 9];
    const smallNums = [0, 1, 2, 3, 4];

    let baseSet = (supportType === "RED") ? redNums : greenNums;
    let filterSet = (strongType === "BIG") ? bigNums : smallNums;

    // Common numbers
    let common = baseSet.filter(n => filterSet.includes(n));
    
    // Chance Calculation (Based on how strong the majority is)
    let totalMajority = Math.max(counts.big, counts.small) + Math.max(counts.red, counts.green);
    let chance = totalMajority >= 16 ? "95%" : (totalMajority >= 12 ? "85%" : "75%");

    return {
        prediction: strongType,
        color: supportType,
        nums: common,
        chance: chance,
        issue: nextIssue
    };
}

// ---------------- RESULT CHECK ----------------
async function checkResult(actualNumber, actualIssue) {
    if (!lastPredictionData || lastPredictionData.issue !== actualIssue) return;

    if (lastMsgId) {
        try { await bot.telegram.deleteMessage(PREDICTION_CHANNEL, lastMsgId) } catch (e) {}
    }

    let isWin = (lastPredictionData.prediction === (actualNumber >= 5 ? "BIG" : "SMALL"));
    
    const resMsg = `🎯 RESULT
━━━━━━━━━━━━━━
🤩CHANCE🤩 : ${lastPredictionData.chance}

🏁BET NUMBER 🏁: ${lastPredictionData.nums.join(" , ")}
✅NUMBER✅ : ${actualNumber}
━━━━━━━━━━━━━━
${isWin ? "✅ WIN" : "❌ LOSS"}`;

    await bot.telegram.sendMessage(PREDICTION_CHANNEL, resMsg);
    await bot.telegram.sendSticker(PREDICTION_CHANNEL, isWin ? WIN_STICKER : LOSS_STICKER);
}

// ---------------- SCAN LOOP ----------------
async function scan() {
    try {
        const proxy = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(API_URL)}`;
        const res = await axios.get(proxy);
        const list = res.data.data.list;

        if (!list || list[0].issueNumber === lastIssue) return;

        // Step 1: Update History (Always keep latest 150)
        historyData = list.map(item => ({
            issue: item.issueNumber,
            number: parseInt(item.number)
        })).slice(0, 150);

        const latest = historyData[0];
        await checkResult(latest.number, latest.issue);

        lastIssue = latest.issue;
        const nextIssue = (BigInt(latest.issue) + 1n).toString();

        // New Prediction based on updated rules
        const ai = getFinalPrediction(nextIssue);
        if (!ai) return;

        const predMsg = `🎯 AI PREDICTION
━━━━━━━━━━━━━━
🌺PERIOD🌺 : ${ai.issue}

🌺RESULT🌺 : ${ai.prediction}

🤩CHANCE🤩 : ${ai.chance}

🏁BET NUMBER 🏁: ${ai.nums.join(" , ")}`;

        const msg = await bot.telegram.sendMessage(PREDICTION_CHANNEL, predMsg);
        lastMsgId = msg.message_id;
        lastPredictionData = ai;

    } catch (e) { console.log("API Error"); }
}

// ---------------- SERVER ----------------
const app = express();
app.get("/", (req, res) => res.send("Bot Running with 150 History Rule"));
app.listen(process.env.PORT || 3000);

bot.launch();
setInterval(scan, 12000);
