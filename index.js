const { Telegraf } = require("telegraf")
const axios = require("axios")
const fs = require("fs")
const express = require("express")

// ---------------- CONFIG ----------------

const BOT_TOKEN = "8662246376:AAEVIjYsJzB1Zvhw4_hZk5E3injCNsV3h9g"

const HISTORY_CHANNEL = "-1003857402557"
const PREDICTION_CHANNEL = "-1003750181011"

const HISTORY_FILE = "./history.json"

const bot = new Telegraf(BOT_TOKEN)

let history = []
let lastIssue = ""

let lastPrediction = ""
let lastMsgId = null
let lastLevel = ""
let lastMatch = ""

// ---------------- LOAD HISTORY ----------------

function loadHistory(){

if(fs.existsSync(HISTORY_FILE)){
history = JSON.parse(fs.readFileSync(HISTORY_FILE))
console.log("History Loaded:",history.length)
}

}

// ---------------- SAVE HISTORY ----------------

function saveHistory(){
fs.writeFileSync(HISTORY_FILE,JSON.stringify(history))
}

// ---------------- COLOR RULE ----------------

function getColor(n){

if([2,4,6,8].includes(n)) return "RED"
if([1,3,7,9].includes(n)) return "GREEN"
if(n==0) return "RED"
if(n==5) return "GREEN"

}

// ---------------- AI ENGINE ----------------

function getPrediction(){

const numbers = history.map(x=>x.number)

for(let len=10; len>=3; len--){

const pattern = numbers.slice(0,len)

let matchNumbers=[]

for(let i=1;i<numbers.length-len;i++){

const win = numbers.slice(i,i+len)

if(pattern.every((v,k)=>v===win[k])){

const next = numbers[i-1]
matchNumbers.push(next)

}

}

if(matchNumbers.length>0){

let big=[]
let small=[]
let red=[]
let green=[]

matchNumbers.forEach(n=>{

if(n>=5) big.push(n)
else small.push(n)

if(getColor(n)=="RED") red.push(n)
if(getColor(n)=="GREEN") green.push(n)

})

// ---------- DECISION ----------

let prediction=""

if(red.length>green.length){

prediction="RED"

}else if(green.length>red.length){

prediction="GREEN"

}else{

if(big.length>small.length){

prediction="BIG"

}else if(small.length>big.length){

prediction="SMALL"

}else{

const first=matchNumbers[0]
prediction = first>=5 ? "BIG":"SMALL"

}

}

return{

prediction,
matchNumbers,
big,
small,
red,
green,
firstMatch:matchNumbers[0],
level:len

}

}

}

return{

prediction:"BIG",
matchNumbers:[],
big:[],
small:[],
red:[],
green:[],
firstMatch:"?",
level:"AI"

}

}

// ---------------- BOT COMMANDS ----------------

// start command

bot.start((ctx)=>{

ctx.reply(`
🤖 AI Prediction Bot Running

Commands:

/history → Download Full History
`)

})

// history download

bot.command("history",async(ctx)=>{

try{

let data=""

history.forEach(h=>{
data += `${h.issue} : ${h.number}\n`
})

fs.writeFileSync("history.txt",data)

await ctx.replyWithDocument({
source:"history.txt"
})

fs.unlinkSync("history.txt")

}catch(e){

ctx.reply("History download error")

}

})

// ---------------- MAIN LOOP ----------------

async function loop(){

try{

const res = await axios.get(
"https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=20",
{timeout:8000}
)

const list = res.data?.data?.list
if(!list) return

const latest = list[0]

const issue = latest.issueNumber
const number = parseInt(latest.number)

if(issue===lastIssue) return

lastIssue=issue

const resultBS = number>=5 ? "BIG":"SMALL"
const resultColor = getColor(number)

// ---------- RESULT CHECK ----------

if(lastPrediction){

let win=false

if(lastPrediction=="BIG" && resultBS=="BIG") win=true
if(lastPrediction=="SMALL" && resultBS=="SMALL") win=true
if(lastPrediction=="RED" && resultColor=="RED") win=true
if(lastPrediction=="GREEN" && resultColor=="GREEN") win=true

try{

await bot.telegram.deleteMessage(
PREDICTION_CHANNEL,
lastMsgId
)

}catch(e){}

const resultMsg=`
📊 RESULT UPDATE
━━━━━━━━━━━━━━
PERIOD : ${issue}

NUMBER : ${number}

RESULT : ${resultBS}

MACHINE LEVEL : L-${lastLevel}

MATCH NUMBER : ${lastMatch}

${win ? "🏆 WIN":"❌ LOSS"}
`

await bot.telegram.sendMessage(
PREDICTION_CHANNEL,
resultMsg
)

}

// ---------- SAVE HISTORY ----------

history.unshift({issue,number})

if(history.length>100000) history.pop()

saveHistory()

// ---------- HISTORY CHANNEL ----------

const historyMsg=`
📜 WIN GO HISTORY
━━━━━━━━━━━━━━
PERIOD : ${issue}

NUMBER : ${number}

RESULT : ${resultBS}
━━━━━━━━━━━━━━
`

await bot.telegram.sendMessage(
HISTORY_CHANNEL,
historyMsg
)

// ---------- AI PREDICTION ----------

const ai = getPrediction()

const nextIssue = (BigInt(issue)+1n).toString()

const predMsg=`
🎯 AI PREDICTION
━━━━━━━━━━━━━━
PERIOD : ${nextIssue}

MATCH NUMBERS
${ai.matchNumbers.join(" ")}

BIG   : ${ai.big.length} → (${ai.big.join(",")})
SMALL : ${ai.small.length} → (${ai.small.join(",")})

RED   : ${ai.red.length} → (${ai.red.join(",")})
GREEN : ${ai.green.length} → (${ai.green.join(",")})

FINAL PREDICTION : ${ai.prediction}

MATCH NUMBER : ${ai.firstMatch}

🧠 MACHINE LEVEL : L-${ai.level}
`

const msg = await bot.telegram.sendMessage(
PREDICTION_CHANNEL,
predMsg
)

lastPrediction = ai.prediction
lastMsgId = msg.message_id
lastLevel = ai.level
lastMatch = ai.firstMatch

}catch(e){

console.log("Loop Running")

}

}

// ---------------- SERVER ----------------

const app = express()

app.get("/",(req,res)=>{
res.send("Bot Running 24/7 🚀")
})

app.listen(process.env.PORT || 3000)

// ---------------- ANTI SLEEP ----------------

const URL = "https://prediction-baba.onrender.com"

setInterval(()=>{
axios.get(URL).catch(()=>{})
},120000)

// ---------------- START ----------------

loadHistory()

setInterval(loop,15000)

bot.launch()
