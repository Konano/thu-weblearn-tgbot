const Telegraf = require('telegraf')
var config = require('./config');

const SocksAgent = require('socks5-https-client/lib/Agent');
const socksAgent = new SocksAgent({
    socksHost: config.proxy.host,
    socksPort: config.proxy.port,
});

const bot = new Telegraf(config.token, { telegram: { agent: socksAgent } })
bot.start((ctx) => ctx.reply('Welcome!'))
bot.help((ctx) => ctx.reply('Send me a sticker'))
bot.on('sticker', (ctx) => ctx.reply('👍'))
bot.hears('hi', (ctx) => ctx.reply('Hey there'))
bot.launch()