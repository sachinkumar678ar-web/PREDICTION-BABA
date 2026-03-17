const { Telegraf } = require("telegraf")
const axios = require("axios")
const express = require("express")

// ---------------- CONFIG ----------------
const BOT_TOKEN = "8662246376:AAEVIjYsJzB1Zvhw4_hZk5E3injCNsV3h9g"
const PREDICTION_CHANNEL = "-1003750181011"
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=50"

const WIN_STICKER = "CAACAgUAAxkBAAFE9FtpuAQsz_OSJEL23Mxjo-Ox-VJD9AACnRUAAjCBqVTN3Vho3FjTQjoE"
const LOSS_STICKER = "CAACAgIAAxkBAAFE9GtpuAS8nPYwxKSN3ixuq4a3PKyOCgACNAADWbv8JWBOiTxAs-8HOgQ"
const JACKPOT_STICKER = "CAACAgUAAxkBAAFE9GFpuASaSlQC_acxHog5Xh5PcEMivQACkRIAApIlqVQtesPFGBnFNToE"

const bot = new Telegraf(BOT_TOKEN)

let historyArr = []
let lastIssue = ""
let lastMsgId = null
let lastPredictionData = null 

const getBS = (n) => (n >= 5 ? "BIG" : "SMALL");
const getColor = (n) => ([0, 2, 4, 6, 8].includes(n) ? "RED" : "GREEN");

// Random Number Generator Logic
function getRandomNums(type) {
    const bigNums = [5, 6, 7, 8, 9];
    const smallNums = [0, 1, 2, 3, 4];
    let pool = type === "BIG" ? bigNums : smallNums;
    // Shuffle and pick 2
    return pool.sort(() => 0.5 - Math.random()).slice(0, 2);
}

// ---------------- RESULT CHECK ----------------
async function checkResult(actualNumber, actualIssue) {
    if (!lastPredictionData || lastPredictionData.issue !== actualIssue) return;

    if (lastMsgId) {
        try { await bot.telegram.deleteMessage(PREDICTION_CHANNEL, lastMsgId) } catch (e) {}
    }

    let status = "";
    let sticker = "";
    let isWin = (lastPredictionData.prediction === getBS(actualNumber));

    if (lastPredictionData.nums.includes(actualNumber)) {
        status = "🤩 JACKPOT";
        sticker = JACKPOT_STICKER;
    } else if (isWin) {
        status = "✅ WIN";
        sticker = WIN_STICKER;
    } else {
        status = "❌ LOSS";
        sticker = LOSS_STICKER;
    }

    const resMsg = `🎯 RESULT
━━━━━━━━━━━━━━
🤩CHANCE🤩 : ${lastPredictionData.chance}

🏁BET NUMBER 🏁: ${lastPredictionData.nums.join(" , ")}
✅NUMBER✅ : ${actualNumber}
━━━━━━━━━━━━━━
${status}`;

    await bot.telegram.sendMessage(PREDICTION_CHANNEL, resMsg);
    await bot.telegram.sendSticker(PREDICTION_CHANNEL, sticker);
}

// ---------------- RULE ENGINE ----------------
function getCombinedPrediction(currentIssue, lastNum) {
    let votes = { BIG: 0, SMALL: 0, RED: 0, GREEN: 0 };
    let finalNums = [];

    // Rule 1: Single Match (Latest 3)
    let mCount = 0;
    for (let i = 1; i < historyArr.length - 1; i++) {
        if (historyArr[i].number === lastNum && mCount < 3) {
            let target = historyArr[i - 1];
            votes[getBS(target.number)]++;
            votes[getColor(target.number)]++;
            if(!finalNums.includes(target.number)) finalNums.push(target.number);
            mCount++;
        }
    }

    // Rule 2: Double Match (Latest 1)
    if (historyArr.length > 3) {
        let p1 = historyArr[0].number, p2 = historyArr[1].number;
        for (let i = 1; i < historyArr.length - 2; i++) {
            if (historyArr[i+1].number === p1 && historyArr[i+2].number === p2) {
                let target = historyArr[i];
                votes[getBS(target.number)]++;
                votes[getColor(target.number)]++;
                if(!finalNums.includes(target.number)) finalNums.push(target.number);
                break;
            }
        }
    }

    // Rule 3: Digit Rule (Next Period Last Digit)
    const nextIssue = (BigInt(currentIssue) + 1n).toString();
    const lastDigit = parseInt(nextIssue.slice(-1));
    const digitRules = {
        0:{res:"SMALL", c:"RED"}, 1:{res:"BIG", c:"GREEN"}, 2:{res:"SMALL", c:"RED"},
        3:{res:"BIG", c:"GREEN"}, 4:{res:"SMALL", c:"RED"}, 5:{res:"SMALL", c:"GREEN"},
        6:{res:"BIG", c:"RED"}, 7:{res:"SMALL", c:"GREEN"}, 8:{res:"BIG", c:"RED"}, 9:{res:"SMALL", c:"GREEN"}
    };
    votes[digitRules[lastDigit].res]++;
    votes[digitRules[lastDigit].c]++;

    // Final Decision
    let finalBS = votes.BIG >= votes.SMALL ? "BIG" : "SMALL";
    let finalColor = votes.RED >= votes.GREEN ? "RED" : "GREEN";

    // Agar pattern matching se numbers nahi mile, toh Random pick karo
    if (finalNums.length < 2) {
        finalNums = getRandomNums(finalBS);
    } else {
        finalNums = finalNums.slice(0, 2);
    }

    // Chance Logic
    let totalVotes = votes[finalBS] + votes[finalColor];
    let chance = totalVotes >= 5 ? "90%" : (totalVotes >= 3 ? "80%" : "70%");

    return { prediction: finalBS, color: finalColor, chance, nums: finalNums, issue: nextIssue };
}

// ---------------- SCAN LOOP ----------------
async function scan() {
    try {
        const proxy = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(API_URL)}`;
        const res = await axios.get(proxy);
        const list = res.data.data.list;
        
        if (!list || list[0].issueNumber === lastIssue) return;

        historyArr = list.map(item => ({ issue: item.issueNumber, number: parseInt(item.number) }));
        const latest = historyArr[0];

        await checkResult(latest.number, latest.issue);

        lastIssue = latest.issue;

        const ai = getCombinedPrediction(latest.issue, latest.number);

        const predMsg = `🎯 AI PREDICTION
━━━━━━━━━━━━━━
🌺PERIOD🌺 : ${ai.issue}

🌺RESULT🌺 : ${ai.prediction}

🤩CHANCE🤩 : ${ai.chance}

🏁BET NUMBER 🏁: ${ai.nums.join(" , ")}`;

        const msg = await bot.telegram.sendMessage(PREDICTION_CHANNEL, predMsg);
        lastMsgId = msg.message_id;
        lastPredictionData = ai;

    } catch (e) { console.log("SCAN ERROR"); }
}

// ---------------- START ----------------
const app = express();
app.get("/", (req,res) => res.send("Bot Running"));
app.listen(process.env.PORT || 3000);

bot.launch();
setInterval(scan, 12000);
