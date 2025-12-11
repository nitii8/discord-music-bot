// Simple music bot using discord.js v14 and @discordjs/voice
// Purpose: a compact, readable example suitable for learning and light use.

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const yts = require('yt-search');

// Load configuration from config.json or environment
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (err) {
  // Fall back to environment variables; user should copy config.example.json -> config.json
  config = { token: process.env.BOT_TOKEN, prefix: '!', ownerId: '' };
}

const PREFIX = config.prefix || '!';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// A single shared player; per-guild control kept in guildState map
const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
const guildState = new Map(); // guildId -> { connection, queue: [], playing, current }

function ensureGuild(id) {
  if (!guildState.has(id)) guildState.set(id, { queue: [], playing: false });
  return guildState.get(id);
}

function enqueue(guildId, track) {
  const state = ensureGuild(guildId);
  state.queue.push(track);
}

async function playNext(guildId) {
  const state = guildState.get(guildId);
  if (!state) return;
  const next = state.queue.shift();
  if (!next) {
    state.playing = false;
    state.current = null;
    return;
  }

  state.playing = true;
  try {
    const stream = ytdl(next.url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 });
    const resource = createAudioResource(stream, { inlineVolume: true });
    if (resource.volume) resource.volume.setVolume(0.8);

    player.play(resource);
    state.current = next;

    const onIdle = () => {
      player.removeListener(AudioPlayerStatus.Idle, onIdle);
      playNext(guildId);
    };

    player.once(AudioPlayerStatus.Idle, onIdle);
  } catch (e) {
    console.error('Playback error:', e);
    playNext(guildId);
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (cmd === 'ping') return message.reply('Pong!');

  if (cmd === 'help') {
    return message.reply('Commands: !play <query|url>, !skip, !stop, !queue, !now');
  }

  if (cmd === 'play') {
    const query = args.join(' ');
    if (!query) return message.reply('Usage: !play <YouTube URL or search terms>');

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('You need to be in a voice channel to play music.');

    let url = null;
    if (ytdl.validateURL(query)) url = query;
    else {
      const res = await yts(query);
      if (res && res.videos && res.videos.length) url = res.videos[0].url;
    }

    if (!url) return message.reply('No results found.');

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    connection.subscribe(player);

    enqueue(message.guild.id, { title: query, url, requestedBy: message.author.tag });
    message.channel.send(`Queued: ${url}`);

    const state = ensureGuild(message.guild.id);
    state.connection = connection;
    if (!state.playing) playNext(message.guild.id);
    return;
  }

  if (cmd === 'skip') {
    player.stop();
    return message.reply('Skipped.');
  }

  if (cmd === 'stop') {
    const state = guildState.get(message.guild.id);
    if (state && state.connection) {
      state.queue = [];
      state.playing = false;
      player.stop();
      try {
        state.connection.destroy();
      } catch (err) {}
      guildState.delete(message.guild.id);
    }
    return message.reply('Stopped and left voice channel.');
  }

  if (cmd === 'queue') {
    const state = guildState.get(message.guild.id);
    if (!state || !state.queue.length) return message.reply('Queue is empty.');
    const lines = state.queue.map((t, i) => `${i + 1}. ${t.title || t.url}`);
    return message.reply(lines.join('\n'), { split: true });
  }

  if (cmd === 'now') {
    const state = guildState.get(message.guild.id);
    if (!state || !state.current) return message.reply('Nothing is playing.');
    return message.reply(`Now playing: ${state.current.title || state.current.url} (requested by ${state.current.requestedBy})`);
  }
});

process.on('unhandledRejection', (err) => console.error('Unhandled rejection', err));

if (config.token) client.login(config.token);
else if (process.env.BOT_TOKEN) client.login(process.env.BOT_TOKEN);
else console.warn('No token found. Copy config.example.json -> config.json and add your bot token.');
