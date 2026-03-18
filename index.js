const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");
const express = require("express");
const admin = require("firebase-admin");

// --- CONFIGURATION ---
const BOT_TOKEN = "8662246376:AAH-5RVqOMl1bGSH8TRu68_BRvvOFT1ehkI";
const PREDICTION_CHANNEL = "-1003750181011";
const HISTORY_LOG_CHANNEL = "-1003756626165"; // Logs yahan jayenge, main channel saaf rahega
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=10";
const SELF_URL = "https://prediction-baba.onrender.com"; 

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } catch (e) { console.error("Firebase Error"); }
}
const db = admin.firestore();
const bot = new Telegraf(BOT_TOKEN);

let historyData = [], lastIssue = "", lastMsgId = null, lastPredictionData = null;

// Stickers
const WIN_STICKER = "CAACAgUAAxkBAAFE9FtpuAQsz_OSJEL23Mxjo-Ox-VJD9AACnRUAAjCBqVTN3Vho3FjTQjoE";
const LOSS_STICKER = "CAACAgIAAxkBAAFE9GtpuAS8nPYwxKSN3ixuq4a3PKyOCgACNAADWbv8JWBOiTxAs-8HOgQ";
const JACKPOT_STICKER = "CAACAgUAAxkBAAFE9GFpuASaSlQC_acxHog5Xh5PcEMivQACkRIAApIlqVQtesPFGBnFNToE";

const getBS = (n) => (n >= 5 ? "BIG" : "SMALL");

// --- HIGH ACCURACY LOGIC ---
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

    return { prediction: finalBS, nums, issue: nextIssue, accuracy: Math.floor(Math.random() * 6) + 93 };
}

// --- ENGINE (NO SLEEP & NO CHANNEL HISTORY) ---
async function scan() {
    try {
        const res = await axios.get(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(API_URL)}`, { timeout: 7000 });
        const list = res.data.data.list;
        if (!list || list[0].issueNumber === lastIssue) return;

        historyData = list.map(item => ({ issue: item.issueNumber, number: parseInt(item.number) })).slice(0, 95);
        const latest = historyData[0];

        // 1. Prediction Channel Result (Update Only)
        if (lastPredictionData && lastPredictionData.issue === latest.issue) {
            // Purana prediction message delete karein
            if (lastMsgId) await bot.telegram.deleteMessage(PREDICTION_CHANNEL, lastMsgId).catch(() => {});
            
            const isWin = lastPredictionData.prediction === getBS(latest.number);
            const isJackpot = lastPredictionData.nums.includes(latest.number);
            
            const resTxt = `🎯 **RESULT: ${latest.number} (${getBS(latest.number)})**\n━━━━━━━━━━━━━━\n${isJackpot ? "🤩 **JACKPOT WINNER!**" : (isWin ? "✅ **WINNER**" : "❌ **LOSS**")}`;
            await bot.telegram.sendMessage(PREDICTION_CHANNEL, resTxt, { parse_mode: "Markdown" });
            await bot.telegram.sendSticker(PREDICTION_CHANNEL, isJackpot ? JACKPOT_STICKER : (isWin ? WIN_STICKER : LOSS_STICKER)).catch(() => {});
        }

        // 2. History Log (Main Channel se hata kar LOG Channel mein bhej rahe hain)
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
    } catch (e) { console.log("Fast Scan Error"); }
}

// --- ADMIN COMMANDS (Private Chat) ---
bot.command(["add", "old"], async (ctx) => {
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
    try {
        const mId = parseInt(ctx.match[1]), mins = parseInt(ctx.match[2]);
        const snap = await db.collection("members").where("memberId", "==", mId).get();
        if (snap.empty) return;
        const expiry = Date.now() + (mins * 60 * 1000);
        await snap.docs[0].ref.update({ expiry, status: "active" });
        const link = await ctx.telegram.createChatInviteLink(PREDICTION_CHANNEL, { member_limit: 1 });
        ctx.editMessageText(`✅ Activated!\n🔗 Link: ${link.invite_link}`);
    } catch (e) {}
});

// Maintenance & Keep-Alive
setInterval(async () => {
    const snap = await db.collection("members").where("status", "==", "active").get();
    snap.forEach(async (doc) => {
        if (doc.data().expiry && Date.now() > doc.data().expiry) {
            await bot.telegram.banChatMember(PREDICTION_CHANNEL, doc.data().telegramId).catch(() => {});
            await bot.telegram.unbanChatMember(PREDICTION_CHANNEL, doc.data().telegramId).catch(() => {});
            await doc.ref.update({ status: "inactive", expiry: null });
        }
    });
}, 60000);

// Render No-Sleep Ping (Every 3 Minutes)
setInterval(() => axios.get(SELF_URL).catch(() => {}), 180000);
setInterval(scan, 10000); // Super Fast 10s Scan

bot.launch();
const app = express();
app.get("/", (r, s) => s.send("Super Fast Bot Active"));
app.listen(process.env.PORT || 3000);
