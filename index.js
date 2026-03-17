const { Telegraf } = require("telegraf")
const axios = require("axios")
const express = require("express")

// ---------------- CONFIG ----------------
const BOT_TOKEN = "8662246376:AAEVIjYsJzB1Zvhw4_hZk5E3injCNsV3h9g"
const PREDICTION_CHANNEL = "-1003750181011"
const HISTORY_LOG_CHANNEL = "-1003857402557" 
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=150"

// Stickers
const WIN_STICKER = "CAACAgUAAxkBAAFE9FtpuAQsz_OSJEL23Mxjo-Ox-VJD9AACnRUAAjCBqVTN3Vho3FjTQjoE"
const LOSS_STICKER = "CAACAgIAAxkBAAFE9GtpuAS8nPYwxKSN3ixuq4a3PKyOCgACNAADWbv8JWBOiTxAs-8HOgQ"
const JACKPOT_STICKER = "CAACAgUAAxkBAAFE9GFpuASaSlQC_acxHog5Xh5PcEMivQACkRIAApIlqVQtesPFGBnFNToE"

const bot = new Telegraf(BOT_TOKEN)

let historyData = [] 
let historyMsgIds = [] // Channel ke messages delete karne ke liye
let lastIssue = ""
let lastMsgId = null
let lastPredictionData = null

// ---------------- HELPERS ----------------
const getBS = (n) => (n >= 5 ? "BIG" : "SMALL");
const getColor = (n) => ([0, 2, 4, 6, 8].includes(n) ? "RED" : "GREEN");

// ---------------- HISTORY CHANNEL AUTO-DELETE ----------------
async function updateHistoryChannel(issue, number) {
    const bs = getBS(number);
    const color = getColor(number);
    
    const text = `📜 HISTORY LOG\n━━━━━━━━━━━━━━\nPERIOD : ${issue}\nNUMBER : ${number}\nRESULT : ${bs} / ${color}\n━━━━━━━━━━━━━━`;
    
    try {
        const msg = await bot.telegram.sendMessage(HISTORY_LOG_CHANNEL, text);
        historyMsgIds.push(msg.message_id);

        // Agar 95 se zyada messages ho gaye hain
        if (historyMsgIds.length > 95) {
            const oldId = historyMsgIds.shift(); // Pehla (sabse purana) ID nikalo
            await bot.telegram.deleteMessage(HISTORY_LOG_CHANNEL, oldId).catch(e => console.log("Delete error"));
        }
    } catch (e) {
        console.log("History Channel Error");
    }
}

// ---------------- PREDICTION ENGINE ----------------
function getFinalPrediction(nextIssue) {
    const targetDigit = nextIssue.slice(-1); 
    let collectedNums = [];
    
    for (let i = 0; i < historyData.length && i < 95; i++) {
        if (historyData[i].issue.slice(-1) === targetDigit) {
            collectedNums.push(historyData[i].number);
        }
    }

    if (collectedNums.length === 0) return null;

    let counts = { BIG: 0, SMALL: 0, RED: 0, GREEN: 0 };
    collectedNums.forEach(n => {
        counts[getBS(n)]++;
        counts[getColor(n)]++;
    });

    // Prediction logic (Max votes)
    let sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    let finalPred = sorted[0][0]; 

    // Number Selection logic
    let winBS = counts.BIG >= counts.SMALL ? "BIG" : "SMALL";
    let winColor = counts.RED >= counts.GREEN ? "RED" : "GREEN";

    const sets = {
        RED: [0, 2, 4, 6, 8], GREEN: [1, 3, 5, 7, 9],
        BIG: [5, 6, 7, 8, 9], SMALL: [0, 1, 2, 3, 4]
    };

    let common = sets[winColor].filter(n => sets[winBS].includes(n));
    let finalNums = common.sort(() => 0.5 - Math.random()).slice(0, 2);

    return { prediction: finalPred, nums: finalNums, issue: nextIssue };
}

// ---------------- MAIN SCAN LOOP ----------------
async function scan() {
    try {
        const proxy = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(API_URL)}`;
        const res = await axios.get(proxy);
        const list = res.data.data.list;
        if (!list || list[0].issueNumber === lastIssue) return;

        historyData = list.map(item => ({ issue: item.issueNumber, number: parseInt(item.number) }));
        const latest = historyData[0];

        // 1. Result Check (Stickers & Delete)
        if (lastPredictionData && lastPredictionData.issue === latest.issue) {
            if (lastMsgId) await bot.telegram.deleteMessage(PREDICTION_CHANNEL, lastMsgId).catch(e=>{});
            
            const isWin = (lastPredictionData.prediction === getBS(latest.number) || lastPredictionData.prediction === getColor(latest.number));
            const isJackpot = lastPredictionData.nums.includes(latest.number);
            
            const status = isJackpot ? "🤩 JACKPOT" : (isWin ? "✅ WIN" : "❌ LOSS");
            const sticker = isJackpot ? JACKPOT_STICKER : (isWin ? WIN_STICKER : LOSS_STICKER);

            await bot.telegram.sendMessage(PREDICTION_CHANNEL, `🎯 RESULT\n━━━━━━━━━━━━━━\n🏁BET NUMBER : ${lastPredictionData.nums.join(" , ")}\n✅NUMBER : ${latest.number}\n━━━━━━━━━━━━━━\n${status}`);
            await bot.telegram.sendSticker(PREDICTION_CHANNEL, sticker);
        }

        // 2. History Channel update (Auto-Delete included)
        await updateHistoryChannel(latest.issue, latest.number);

        lastIssue = latest.issue;
        const nextIssue = (BigInt(latest.issue) + 1n).toString();

        // 3. New Prediction
        const ai = getFinalPrediction(nextIssue);
        if (ai) {
            const msg = await bot.telegram.sendMessage(PREDICTION_CHANNEL, `🎯 AI PREDICTION\n━━━━━━━━━━━━━━\n🌺PERIOD🌺 : ${ai.issue}\n🌺RESULT🌺 : ${ai.prediction}\n🤩CHANCE🤩 : 95%\n🏁BET NUMBER : ${ai.nums.join(" , ")}`);
            lastMsgId = msg.message_id;
            lastPredictionData = ai;
        }
    } catch (e) { console.log("Scan Error"); }
}

// ---------------- START ----------------
const app = express();
app.get("/", (req, res) => res.send("Bot Online - Auto History Clean On"));
app.listen(process.env.PORT || 3000);

bot.launch();
setInterval(scan, 12000);
