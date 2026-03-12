const { Telegraf } = require("telegraf");
const axios = require("axios");
const fs = require("fs");
const express = require("express");

const BOT_TOKEN = '8662246376:AAGCtrWKIVe2-MZqRJtBAi2UvPCulGdnxhM';

const HISTORY_CHANNEL = '-1003857402557';
const PREDICTION_CHANNEL = '-1003750181011';

const HISTORY_FILE = "./history.json";

const bot = new Telegraf(BOT_TOKEN);

let history = [];
let lastIssue = "";

let lastPrediction = "";
let lastMsgId = null;
let lastLevel = "";

// ---------------- LOAD HISTORY ----------------

function loadHistory() {

if (fs.existsSync(HISTORY_FILE)) {

history = JSON.parse(fs.readFileSync(HISTORY_FILE));

console.log("History Loaded:", history.length);

}

}

// ---------------- SAVE HISTORY ----------------

function saveHistory(){

fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));

}

// ---------------- AI ENGINE ----------------

function getPrediction(seq){

const numbers = history.map(x => x.number);

for(let len = 10; len >= 1; len--){

const pattern = seq.slice(0,len);

for(let i = 1; i < numbers.length - len; i++){

const win = numbers.slice(i,i+len);

if(pattern.every((v,k)=>v === win[k])){

const next = numbers[i-1];

return {
pred: next >=5 ? "BIG":"SMALL",
level: len,
num: next
};

}

}

}

return {
pred: seq[0]>=5 ? "SMALL":"BIG",
level: "TREND",
num: "?"
};

}

// ---------------- BOT COMMANDS ----------------

bot.start((ctx)=>{

ctx.reply(`
🤖 AI Prediction Bot Running

Commands:

/history → Download full history
`);

});

// Download full history file

bot.command("history", async(ctx)=>{

try{

let data = "";

history.forEach(h=>{
data += `${h.issue} : ${h.number}\n`;
});

fs.writeFileSync("history.txt",data);

await ctx.replyWithDocument({
source:"history.txt"
});

fs.unlinkSync("history.txt");

}catch(e){

ctx.reply("History error");

}

});

// ---------------- MAIN LOOP ----------------

async function loop(){

try{

const res = await axios.get(
"https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=20"
);

const list = res.data?.data?.list;

if(!list) return;

const latest = list[0];

const issue = latest.issueNumber;

const number = parseInt(latest.number);

if(issue === lastIssue) return;

lastIssue = issue;

const result = number >=5 ? "BIG":"SMALL";

// ---------- RESULT UPDATE ----------

if(lastPrediction){

const win = lastPrediction === result;

try{
await bot.telegram.deleteMessage(
PREDICTION_CHANNEL,
lastMsgId
);
}catch(e){}

const resultMsg = `
📊 RESULT UPDATE
━━━━━━━━━━━━━━
🆔 PERIOD: ${issue}

🎲 RESULT: ${result} (${number})

🧠 MACH : L-${lastLevel}

${win ? "🏆 WIN" : "❌ LOSS"}
`;

await bot.telegram.sendMessage(
PREDICTION_CHANNEL,
resultMsg
);

}

// ---------- SAVE HISTORY ----------

history.unshift({issue,number});

if(history.length > 1000000) history.pop();

saveHistory();

// ---------- HISTORY CHANNEL ----------

const historyMsg = `
📜 WIN GO HISTORY
━━━━━━━━━━━━━━
🆔 PERIOD: ${issue}
🎲 NUMBER: ${number}
📊 RESULT: ${result}
━━━━━━━━━━━━━━
`;

await bot.telegram.sendMessage(
HISTORY_CHANNEL,
historyMsg
);

// ---------- AI PREDICTION ----------

const seq = history.slice(0,10).map(x=>x.number);

const ai = getPrediction(seq);

const nextIssue = (BigInt(issue)+1n).toString();

const predMsg = `
🎯 AI PREDICTION
━━━━━━━━━━━━━━
🆔 PERIOD: ${nextIssue}

🎲 PREDICTION: ${ai.pred}

🧠 MACH : L-${ai.level}

🎰 MACH NO : ${ai.num}

⚡ SCAN: ${history.length}
`;

const msg = await bot.telegram.sendMessage(
PREDICTION_CHANNEL,
predMsg
);

lastPrediction = ai.pred;
lastMsgId = msg.message_id;
lastLevel = ai.level;

}catch(e){

console.log("Loop Running...");

}

}

// ---------------- SERVER ----------------

const app = express();

app.get("/",(req,res)=>res.send("Bot Running"));

app.listen(process.env.PORT || 3000);

// ---------------- START ----------------

loadHistory();

setInterval(loop,15000);

bot.launch();
