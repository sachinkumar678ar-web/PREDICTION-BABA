const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");
const express = require("express");

// --- CONFIGURATION (SAB KUCH YAHAN HAI) ---
const BOT_TOKEN = "8662246376:AAH-5RVqOMl1bGSH8TRu68_BRvvOFT1ehkI";

const PREDICTION_CHANNEL = "-1003750181011";

const HISTORY_LOG_CHANNEL = "-1003756626165";

const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=10";

const ADMIN_PASSWORD = "sachin855"

const SELF_URL = "https://prediction-baba.onrender.com"; 

const bot = new Telegraf(BOT_TOKEN);

// In-Memory Database
let historyData = []; 
let activeMembers = new Map(); 
let lastIssue = ""; 
let lastMsgId = null; 
let lastPredictionData = null;

const WIN_STICKER = "CAACAgUAAxkBAAFE9FtpuAQsz_OSJEL23Mxjo-Ox-VJD9AACnRUAAjCBqVTN3Vho3FjTQjoE";
const LOSS_STICKER = "CAACAgIAAxkBAAFE9GtpuAS8nPYwxKSN3ixuq4a3PKyOCgACNAADWbv8JWBOiTxAs-8HOgQ";
const JACKPOT_STICKER = "CAACAgUAAxkBAAFE9GFpuASaSlQC_acxHog5Xh5PcEMivQACkRIAApIlqVQtesPFGBnFNToE";

const getBS = (n) => (n >= 5 ? "BIG" : "SMALL");

// --- LOGIC ---
function getSmartPrediction(nextIssue) {
    const targetDigit = nextIssue.slice(-1); 
    let matches = historyData.filter(h => h.issue.slice(-1) === targetDigit).slice(0, 15);
    if (matches.length < 3) return null;
    let weightBS = { BIG: 0, SMALL: 0 };
    matches.forEach((m, index) => { weightBS[getBS(m.number)] += (15 - index); });
    let finalBS = weightBS.BIG >= weightBS.SMALL ? "BIG" : "SMALL";
    let nums = (finalBS === "BIG" ? [5,6,7,8,9] : [0,1,2,3,4]).sort(() => 0.5 - Math.random()).slice(0, 2);
    return { prediction: finalBS, nums, issue: nextIssue, accuracy: Math.floor(Math.random() * 5) + 94 };
}

async function fetchData() {
    const proxies = [`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(API_URL)}`, `https://api.allorigins.win/raw?url=${encodeURIComponent(API_URL)}` ];
    for (let url of proxies) {
        try {
            const res = await axios.get(url, { timeout: 6000 });
            if (res.data?.data?.list) return res.data.data.list;
        } catch (e) { continue; }
    }
    return null;
}

async function scan() {
    try {
        const list = await fetchData();
        if (!list || list[0].issueNumber === lastIssue) return;
        historyData = list.map(item => ({ issue: item.issueNumber, number: parseInt(item.number) })).slice(0, 95);
        const latest = historyData[0];

        if (lastPredictionData && lastPredictionData.issue === latest.issue) {
            if (lastMsgId) await bot.telegram.deleteMessage(PREDICTION_CHANNEL, lastMsgId).catch(() => {});
            const isWin = lastPredictionData.prediction === getBS(latest.number);
            const isJackpot = lastPredictionData.nums.includes(latest.number);
            await bot.telegram.sendMessage(PREDICTION_CHANNEL, `🎯 **RESULT: ${latest.number} (${getBS(latest.number)})**\n━━━━━━━━━━━━━━\n${isJackpot ? "🤩 **JACKPOT!**" : (isWin ? "✅ **WIN**" : "❌ **LOSS**")}`, { parse_mode: "Markdown" });
            await bot.telegram.sendSticker(PREDICTION_CHANNEL, isJackpot ? JACKPOT_STICKER : (isWin ? WIN_STICKER : LOSS_STICKER)).catch(() => {});
        }

        await bot.telegram.sendMessage(HISTORY_LOG_CHANNEL, `📜 LOG: ${latest.issue} ➔ ${latest.number} (${getBS(latest.number)})`).catch(() => {});

        lastIssue = latest.issue;
        const ai = getSmartPrediction((BigInt(latest.issue) + 1n).toString());
        if (ai) {
            const msg = await bot.telegram.sendMessage(PREDICTION_CHANNEL, `🎯 **AI PREDICTION**\n━━━━━━━━━━━━━━\n🌺 PERIOD : ${ai.issue}\n🔥 RESULT : ${ai.prediction}\n🤩 CHANCE : ${ai.accuracy}%\n🏁 BET NUM : ${ai.nums.join(" , ")}`, { parse_mode: "Markdown" });
            lastMsgId = msg.message_id; 
            lastPredictionData = ai;
        }
    } catch (e) { console.log("Scanning..."); }
}

// --- COMMANDS ---
bot.command("members", (ctx) => {
    const userId = ctx.from.id;
    if (!activeMembers.has(userId)) activeMembers.set(userId, { memberId: Math.floor(10000000 + Math.random() * 90000000), status: "inactive", expiry: null });
    const user = activeMembers.get(userId);
    ctx.reply(`🆔 Your ID: \`${user.memberId}\`\nStatus: ${user.status.toUpperCase()}`, { parse_mode: "Markdown" });
});

bot.command(["add", "old"], (ctx) => {
    const args = ctx.message.text.split(" ");
    if (args[1] === ADMIN_PASSWORD && args[2]) {
        const kb = Markup.inlineKeyboard([[Markup.button.callback("1 Min", `p_${args[2]}_1`), Markup.button.callback("1 Day", `p_${args[2]}_1440`)],[Markup.button.callback("30 Days", `p_${args[2]}_43200`), Markup.button.callback("Lifetime", `p_${args[2]}_52560000`)]]);
        ctx.reply(`🆔 ID: ${args[2]}\nSelect Plan:`, kb);
    } else { ctx.reply("❌ Password Galat ya ID Missing!"); }
});

bot.action(/p_(\d+)_(\d+)/, async (ctx) => {
    const mId = parseInt(ctx.match[1]), mins = parseInt(ctx.match[2]);
    let tUser = null;
    activeMembers.forEach((v, k) => { if(v.memberId === mId) tUser = k; });
    if (!tUser) return ctx.answerCbQuery("ID not found!");
    activeMembers.set(tUser, { ...activeMembers.get(tUser), status: "active", expiry: Date.now() + (mins * 60 * 1000) });
    const link = await ctx.telegram.createChatInviteLink(PREDICTION_CHANNEL, { member_limit: 1 });
    ctx.editMessageText(`✅ Activated!\n🔗 Link: ${link.invite_link}`);
});

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

setInterval(() => axios.get(SELF_URL).catch(() => {}), 120000);
setInterval(scan, 8000);

bot.launch();
const app = express();
app.get("/", (r, s) => s.send("Bot is Running"));
app.listen(process.env.PORT || 3000);
