const { Telegraf } = require("telegraf")
const axios = require("axios")
const fs = require("fs")
const express = require("express")

//--------------------------------
// EXPRESS SERVER (RENDER KEEP ALIVE)
//--------------------------------

const app = express()

app.get("/", (req,res)=>{
res.send("Bot Running 24 Hours 🚀")
})

app.listen(3000,()=>{
console.log("Web Server Started")
})

//--------------------------------
// CONFIG
//--------------------------------

const BOT_TOKEN = '8662246376:AAGCtrWKIVe2-MZqRJtBAi2UvPCulGdnxhM';

const HISTORY_CHANNEL = '-1003857402557';
const PREDICTION_CHANNEL = '-1003750181011';


const RENDER_URL = "https://prediction-baba.onrender.com"

//--------------------------------

const bot = new Telegraf(BOT_TOKEN)

let history=[]
let lastPrediction=null
let lastMessage=null
let loadMode=false

//--------------------------------
// LOAD HISTORY FILE
//--------------------------------

function loadHistory(){

if(!fs.existsSync("history.txt")) return

let data = fs.readFileSync("history.txt","utf8")

history = data
.split("\n")
.map(x=>parseInt(x))
.filter(x=>!isNaN(x))

console.log("History Loaded:",history.length)

}

//--------------------------------
// SAVE HISTORY
//--------------------------------

function saveHistory(){

fs.writeFileSync(
"history.txt",
history.join("\n")
)

}

//--------------------------------
// LOAD HISTORY COMMAND
//--------------------------------

bot.command("loadhistory",(ctx)=>{

loadMode=true

ctx.reply("📥 Send WIN GO HISTORY messages")

})

//--------------------------------
// RECEIVE HISTORY
//--------------------------------

bot.on("text",(ctx)=>{

if(!loadMode) return

let text = ctx.message.text

let regex=/PERIOD:\s*(\d+)[\s\S]*?NUMBER:\s*(\d)/g

let records=[]
let match

while((match=regex.exec(text))!==null){

records.push({
period:parseInt(match[1]),
number:parseInt(match[2])
})

}

if(records.length==0){

ctx.reply("❌ No history detected")
return

}

records.sort((a,b)=>b.period-a.period)

history=records.map(r=>r.number)

saveHistory()

ctx.reply(`✅ ${history.length} history loaded`)

loadMode=false

})

//--------------------------------
// API FETCH
//--------------------------------

async function fetchData(){

try{

const proxy =
`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent("https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=10")}`

const res = await axios.get(proxy)

if(res.data?.data?.list){
return res.data.data.list
}

}catch(e){

console.log("API Error")

}

return null

}

//--------------------------------
// BIG SMALL
//--------------------------------

function getBigSmall(n){

return n<=4 ? "SMALL":"BIG"

}

//--------------------------------
// PATTERN SCAN
//--------------------------------

function scanPattern(){

let maxMatch=0
let foundNumbers=[]

for(let len=9;len>=1;len--){

let pattern=history.slice(0,len)

for(let i=0;i<history.length-len;i++){

let ok=true

for(let j=0;j<len;j++){

if(history[i+j]!=pattern[j]){
ok=false
break
}

}

if(ok && history[i-1]!=undefined){

foundNumbers.push(history[i-1])
maxMatch=len

}

}

if(foundNumbers.length>0) break

}

return {foundNumbers,maxMatch}

}

//--------------------------------
// SEND PREDICTION
//--------------------------------

async function sendPrediction(period){

let scan=scanPattern()

let nums=scan.foundNumbers

if(nums.length==0) return

let big=0
let small=0

nums.forEach(n=>{

if(n<=4) small++
else big++

})

let prediction=big>=small?"BIG":"SMALL"

let msg=
`🎯 AI PREDICTION
━━━━━━━━━━━━━━
🆔 PERIOD: ${period}

🎲 PREDICTION: ${prediction}

🧠 MATCH : L-${scan.maxMatch}

🎰 MATCH NUMBERS : ${nums.join(",")}

⚡ HISTORY SCAN : ${history.length}`

let m=await bot.telegram.sendMessage(
PREDICTION_CHANNEL,
msg
)

lastPrediction={
period,
prediction,
match:scan.maxMatch
}

lastMessage=m.message_id

}

//--------------------------------
// RESULT CHECK
//--------------------------------

async function checkResult(period,number){

if(!lastPrediction) return

let result=getBigSmall(number)

let status=result==lastPrediction.prediction
? "✅ WIN":"❌ LOSS"

try{

await bot.telegram.deleteMessage(
PREDICTION_CHANNEL,
lastMessage
)

}catch(e){}

let msg=
`📊 RESULT UPDATE
━━━━━━━━━━━━━━
🆔 PERIOD: ${period}

🎲 RESULT: ${result} (${number})

🧠 MATCH : L-${lastPrediction.match}

${status}`

await bot.telegram.sendMessage(
PREDICTION_CHANNEL,
msg
)

}

//--------------------------------
// MAIN LOOP
//--------------------------------

async function mainLoop(){

let data=await fetchData()

if(!data) return

let latest=data[0]

let number=parseInt(latest.number)
let period=latest.issueNumber

if(history[0]!=number){

history.unshift(number)

saveHistory()

await bot.telegram.sendMessage(
HISTORY_CHANNEL,
`📜 WIN GO HISTORY
━━━━━━━━━━━━━━
🆔 PERIOD: ${period}
🎲 NUMBER: ${number}
📊 RESULT: ${getBigSmall(number)}
━━━━━━━━━━━━━━`
)

await checkResult(period,number)

await sendPrediction(period)

}

}

//--------------------------------
// RENDER AUTO PING
//--------------------------------

setInterval(async ()=>{

try{

await axios.get(RENDER_URL)

console.log("Render Ping Success")

}catch(e){

console.log("Render Ping Failed")

}

},300000)

//--------------------------------
// COMMANDS
//--------------------------------

bot.start(ctx=>{

ctx.reply("🤖 AI Pattern Bot Started")

})

bot.command("history",ctx=>{

ctx.replyWithDocument({
source:"history.txt"
})

})

//--------------------------------
// START BOT
//--------------------------------

function start(){

loadHistory()

setInterval(mainLoop,15000)

bot.launch()

console.log("BOT RUNNING 24 HOURS")

}

start()
