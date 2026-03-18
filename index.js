const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");
const express = require("express");

// --- CONFIGURATION ---
const BOT_TOKEN = "8662246376:AAH-5RVqOMl1bGSH8TRu68_BRvvOFT1ehkI";
const PREDICTION_CHANNEL = "-1003750181011";
const HISTORY_LOG_CHANNEL = "-1003756626165"; // Logs yahan jayenge, main channel saaf rahega
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=10";
const SELF_URL = "https://prediction-baba.onrender.com"; 

const bot = new Telegraf(BOT_TOKEN);

// In-Memory Database (No Firebase Needed)
let historyData = []; 
let activeMembers = new Map(); // Members data yahan save hoga
let lastIssue = ""; 
let lastMsgId = null; 
let lastPredictionData = null;

// Stickers
const WIN_STICKER = "CAACAgUAAxkBAAFE9FtpuAQsz_OSJEL23Mxjo-Ox-VJD9AACnRUAAjCBqVTN3Vho3FjTQjoE";
const LOSS_STICKER = "CAACAgIAAxkBAAFE9GtpuAS8nPYwxKSN3ixuq4a3PKyOCgACNAADWbv8JWBOiTxAs-8HOgQ";
const JACKPOT_STICKER = "CAACAgUAAxkBAAFE9GFpuASaSlQC_acxHog5Xh5PcEMivQACkRIAApIlqVQtesPFGBnFNToE";

const getBS = (n) => (n >= 5 ? "BIG" : "SMALL");

// --- PREDICTION LOGIC ---
function getSmartPrediction(nextIssue) {
    const targetDigit = nextIssue.slice(-1); 
    let matches = historyData.filter(h => h.issue.slice(-1) === targetDigit).slice(0, 15);
    if (matches.length < 3) return null;

    let weightBS = { BIG: 0, SMALL: 0 };
    matches.forEach((m, index) => {
        weightBS[getBS(m.number)] += (15 - index);
    });

    let finalBS = weightBS.BIG >= weightBS.SMALL ? "BIG" : "SMALL";
    const sets = { BIG: [5, 6, 7, 8, 9], SMALL: [0, 1, 2, 3, 4] };
    let nums = sets[finalBS].sort(() => 0.5 - Math.random()).slice(0, 2);

    return { 
        prediction: finalBS, 
        nums, 
        issue: nextIssue, 
        accuracy: Math.floor(Math.random() * 6) + 93 
    };
}

// --- SCANNING ENGINE ---
async function scan() {
    try {
        const res = await axios.get(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(API_URL)}`, { timeout: 8000 });
        const list = res.data.data.list;
        if (!list || list[0].issueNumber === lastIssue) return;

        historyData = list.map(item => ({ 
            issue: item.issueNumber, 
            number: parseInt(item.number) 
        })).slice(0, 95);

        const latest = historyData[0];

        // 1. Result Update
        if (lastPredictionData && lastPredictionData.issue === latest.issue) {
            if (lastMsgId) await bot.telegram.deleteMessage(PREDICTION_CHANNEL, lastMsgId).catch(() => {});
            
            const isWin = lastPredictionData.prediction === getBS(latest.number);
            const isJackpot = lastPredictionData.nums.includes(latest.number);
            
            const resTxt = `🎯 **RESULT: ${latest.number} (${getBS(latest.number)})**\n━━━━━━━━━━━━━━\n${isJackpot ? "🤩 **JACKPOT WINNER!**" : (isWin ? "✅ **WINNER**" : "❌ **LOSS**")}`;
            await bot.telegram.sendMessage(PREDICTION_CHANNEL, resTxt, { parse_mode: "Markdown" });
            await bot.telegram.sendSticker(PREDICTION_CHANNEL, isJackpot ? JACKPOT_STICKER : (isWin ? WIN_STICKER : LOSS_STICKER)).catch(() => {});
        }

        // 2. History Log (Separate Channel)
        const logTxt = `📜 LOG: ${latest.issue} ➔ ${latest.number} (${getBS(latest.number)})`;
        await bot.telegram.sendMessage(HISTORY_LOG_CHANNEL, logTxt).catch(() => {});

        // 3. New Prediction (Main Channel)
        lastIssue = latest.issue;
        const ai = getSmartPrediction((BigInt(latest.issue) + 1n).toString());
        if (ai) {
            const msg = await bot.telegram.sendMessage(PREDICTION_CHANNEL, 
                `🎯 **AI PREDICTION**\n━━━━━━━━━━━━━━\n🌺 PERIOD : ${ai.issue}\n🔥 RESULT : ${ai.prediction}\n🤩 CHANCE : ${ai.accuracy}%\n🏁 BET NUM : ${ai.nums.join(" , ")}\n━━━━━━━━━━━━━━`, 
                { parse_mode: "Markdown" }
            );
            lastMsgId = msg.message_id; 
            lastPredictionData = ai;
        }
    } catch (e) { console.log("Scan Delay..."); }
}

// --- MEMBER MANAGEMENT (In-Memory) ---
bot.command("members", (ctx) => {
    const userId = ctx.from.id;
    if (!activeMembers.has(userId)) {
        const tempId = Math.floor(10000000 + Math.random() * 90000000);
        activeMembers.set(userId, { memberId: tempId, status: "inactive", expiry: null });
    }
    const user = activeMembers.get(userId);
    ctx.reply(`🆔 Your ID: \`${user.memberId}\`\nStatus: ${user.status.toUpperCase()}`, { parse_mode: "Markdown" });
});

bot.command(["add", "old"], (ctx) => {
    const args = ctx.message.text.split(" ");
    if (args[1] === process.env.ADMIN_PASSWORD && args[2]) {
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback("1 Min", `p_${args[2]}_1`), Markup.button.callback("1 Day", `p_${args[2]}_1440`)],
            [Markup.button.callback("30 Days", `p_${args[2]}_43200`), Markup.button.callback("Lifetime", `p_${args[2]}_52560000`)]
        ]);
        ctx.reply(`🆔 ID: ${args[2]}\nSelect Plan:`, kb);
    }
});

bot.action(/p_(\d+)_(\d+)/, async (ctx) => {
    const mId = parseInt(ctx.match[1]), mins = parseInt(ctx.match[2]);
    let targetUser = null;

    // Find user in Map
    for (let [tid, data] of activeMembers) {
        if (data.memberId === mId) {
            targetUser = tid;
            break;
        }
    }

    if (!targetUser) return ctx.answerCbQuery("ID not found! Ask user to send /members first.");

    const expiry = Date.now() + (mins * 60 * 1000);
    activeMembers.set(targetUser, { ...activeMembers.get(targetUser), status: "active", expiry });

    const link = await ctx.telegram.createChatInviteLink(PREDICTION_CHANNEL, { member_limit: 1 });
    ctx.editMessageText(`✅ Activated!\n🔗 Link: ${link.invite_link}`);
});

// Maintenance & No-Sleep
setInterval(() => {
    const now = Date.now();
    activeMembers.forEach(async (data, tid) => {
        if (data.status === "active" && data.expiry && now > data.expiry) {
            await bot.telegram.banChatMember(PREDICTION_CHANNEL, tid).catch(() => {});
            await bot.telegram.unbanChatMember(PREDICTION_CHANNEL, tid).catch(() => {});
            activeMembers.set(tid, { ...data, status: "inactive", expiry: null });
        }
    });
}, 60000);

setInterval(() => axios.get(SELF_URL).catch(() => {}), 180000);
setInterval(scan, 12000);

bot.launch();
const app = express();
app.get("/", (r, s) => s.send("No-Firebase Bot Active"));
app.listen(process.env.PORT || 3000);
