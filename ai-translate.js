require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEN_AI);
const fs = require("fs");

const cash = new Object();
const cacheWebhooks = new Map();
const channelcash = new Object();

const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildWebhooks]
});

client.once('ready', () => {
    console.log(`${client.user.tag} Ready`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) {
        return;
    }
    if (!cash[message.guild.id]) {
        return;
    }
    if (message.content==="") {
        return;
    }
    if (cash[message.guild.id][message.channel.id].start===1) {
        try{
        const nickname = message.member.displayName; //webhookのauthorname
        const webhook = await getWebhookInChannel(
            message.channel,
            message.guild.id+"-"+message.channel.id
        );
        const model = genAI.getGenerativeModel({ model: cash[message.guild.id][message.channel.id].model });
        const prompt = `次の文章を、${cash[message.guild.id][message.channel.id].language}に翻訳してください。ただし、翻訳後のメッセージに"@"が含まれる場合には"@"を"＠"に置き換えてください。また、翻訳後のメッセージは1024文字を超えてはいけません。翻訳後のメッセージのみを返してください。「${message.content}」`;
        const res = await model.generateContent(prompt);
        appendFile("./log.txt", `time: ${Date.now()}, prompt: ${prompt}, model: ${cash[message.guild.id][message.channel.id].model}, language: ${cash[message.guild.id][message.channel.id].language}, guildId: ${message.guild.id}, channelId: ${message.channel.id}, userId: ${message.author.id}, messagecontent: ${message.content}, response: ${res.response.text()}\n`);
        console.log(res.response.text())
        return await webhook.send({
            content: `${res.response.text()}`, 
            username: `from: ${nickname}`,
            avatarURL: message.author.avatarURL({ dynamic: true }),
        });
        }catch(e){
            return SendError(message.guild.id,e,"AI翻訳")
        }
    }
});

client.on("interactionCreate", async (interaction) => {
    if(interaction.commandName==="devaitranslate"){
        var start = interaction.options.getString("start")
        var language = interaction.options.getString("language")
        var model = interaction.options.getString("model")
        if(!cash[interaction.guild.id]){
            cash[interaction.guild.id]={}
        }
        if(!cash[interaction.guild.id][interaction.channel.id]){
            cash[interaction.guild.id][interaction.channel.id]={"start":0,"language":"","model":""}
        }
        if(start==="stop"){
            cash[interaction.guild.id][interaction.channel.id].start=0
            return await interaction.reply({
                content: `AI翻訳を終了しました。\n今回指定していた言語は${cash[interaction.guild.id][interaction.channel.id].language}です。\nAIモデルは${cash[interaction.guild.id][interaction.channel.id].model}です。`,
              });
        }
        if(start==="start"){
            if(!language){
                return await interaction.reply({
                    content: `言語が指定されていません。`,
                    ephemeral: true,
                  });
            }
            if(!model){
                return await interaction.reply({
                    content: `AIモデルが指定されていません。`,
                    ephemeral: true,
                  });
            }
            cash[interaction.guild.id][interaction.channel.id]={
                "start":1,
                "language":language,
                "model":model
            }
            return await interaction.reply({
                content: `AI翻訳を開始しました。\n今回指定した言語は${cash[interaction.guild.id][interaction.channel.id].language}です。\nAIモデルは${cash[interaction.guild.id][interaction.channel.id].model}です。\nサーバー全体で、 [レート制限](https://ai.google.dev/gemini-api/docs/rate-limits?hl=ja&_gl=1*9hv92k*_up*MQ..*_ga*MjA2ODEzOTY4NC4xNzQwNzQ0OTI0*_ga_P1DBVKWT6V*MTc0MDc0NDkyMy4xLjAuMTc0MDc0NDkyMy4wLjAuMTQ1MzA5NzgxMA..#current-rate-limits) が適用されます。(無料枠)\nまた、この機能には追加の利用規約が存在し、メッセージを送信した時点で適用されます。\n利用規約: https://note.com/maka_7264/n/nb246ce274312?sub_rt=share_pb`,
              });
        }
        return await interaction.reply({
            content: `ん～例外処理がないねぇ～\n開発者は何をしているんだ？(他人事のように話す)`,
            ephemeral: true,
          });
    }
})

if (process.env.DISCORD_BOT_TOKEN == undefined) {
  console.log("DISCORD_BOT_TOKENが設定されていません。");
  process.exit(0);
}

client.login(process.env.DISCORD_BOT_TOKEN);

function appendFile(path, data) {
    fs.appendFile(path, data, function (err) {
      if (err) {
          throw err;
      }
    });
  }

async function getWebhookInChannel(channel, guildid, o) {
    //webhookのキャッシュを自前で保持し速度向上
    const webhook =
      cacheWebhooks.get(channel.id) ?? (await getWebhook(channel, guildid, o));
    return webhook;
  }
  
  async function getWebhook(channel, guildid, o) {
    try {
      if (!(o===0)){
          if(channelcash[channel.id]==0) {
          if(!cacheWebhooks.get(channel.id)) {
              return "error";
          }
          return cacheWebhooks.get(channel.id);
          }
      }
      channelcash[channel.id]=0
      //チャンネル内のWebhookを全て取得
      const webhooks = await channel.fetchWebhooks();
      //tokenがある（＝webhook製作者がbot自身）Webhookを取得、なければ作成する
      const webhook =
        webhooks?.find((v) => v.token) ??
        (await channel.createWebhook("Bot Webhook"));
      //キャッシュに入れて次回以降使い回す
      if (webhook) cacheWebhooks.set(channel.id, webhook);
      return webhook;
    } catch (e) {
      SendError(guildid, e, "getwebhook");
      return "error";
    }
  }

function SendError(guildid, errormessage, at) {
    var code = guildid + "-" + Date.now();
    client.channels.cache.get("850881106513625108").send({
      embeds: [
        {
          author: {
            name: `CatchErrorイベントが発火しました`,
          },
          title: `Error at ${at}\nstopcode : ${code}`,
          description: `${errormessage}`,
          footer: {
            text: `Detect Error Function`,
          },
          timestamp: new Date(),
        },
      ],
    });
    return code;
  }
