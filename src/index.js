const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Lavalink } = require('lavalink.js');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();
client.players = new Collection();
client.playlists = new Collection();

// Event Handler
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Command Handler
const commandFolders = fs.readdirSync('./commands');
for (const folder of commandFolders) {
  const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(`./commands/${folder}/${file}`);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(`[WARNING] Command at ./commands/${folder}/${file} missing data or execute property`);
    }
  }
}

// Lavalink Player Setup
const lavalink = new Lavalink({
  hosts: [
    {
      host: process.env.LAVALINK_HOST || 'localhost',
      port: parseInt(process.env.LAVALINK_PORT) || 2333,
      password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
    },
  ],
  send: (guild_id, packet) => {
    const guild = client.guilds.cache.get(guild_id);
    if (guild) guild.shard.send(packet);
  },
});

client.lavalink = lavalink;

// Music Queue Management
class MusicPlayer {
  constructor(guild) {
    this.guild = guild;
    this.queue = [];
    this.nowPlaying = null;
    this.isPlaying = false;
    this.volume = 100;
    this.loopMode = 'none'; // none, one, all
  }

  addToQueue(track) {
    this.queue.push(track);
    return this.queue.length;
  }

  skip() {
    if (this.queue.length > 0) {
      this.nowPlaying = this.queue.shift();
      return this.nowPlaying;
    }
    return null;
  }

  setLoopMode(mode) {
    if (['none', 'one', 'all'].includes(mode)) {
      this.loopMode = mode;
      return true;
    }
    return false;
  }

  getQueue() {
    return this.queue;
  }

  clearQueue() {
    this.queue = [];
  }

  setVolume(vol) {
    if (vol >= 0 && vol <= 200) {
      this.volume = vol;
      return true;
    }
    return false;
  }
}

// Initialize Player
function getOrCreatePlayer(guild) {
  if (!client.players.has(guild.id)) {
    client.players.set(guild.id, new MusicPlayer(guild));
  }
  return client.players.get(guild.id);
}

// Slash Command Interaction Handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
    }
  }
});

// Button Interaction Handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const playerId = interaction.customId.split('_')[0];
  const player = client.players.get(interaction.guildId);

  if (interaction.customId.includes('play')) {
    if (!player) return interaction.reply({ content: 'No music playing!', ephemeral: true });
    player.isPlaying = true;
    await interaction.reply({ content: '\\u25b6\\ufe0f Resumed playback', ephemeral: true });
  } else if (interaction.customId.includes('pause')) {
    if (!player) return interaction.reply({ content: 'No music playing!', ephemeral: true });
    player.isPlaying = false;
    await interaction.reply({ content: '\\u23f8 Paused playback', ephemeral: true });
  } else if (interaction.customId.includes('skip')) {
    if (!player) return interaction.reply({ content: 'No music playing!', ephemeral: true });
    const next = player.skip();
    if (next) {
      await interaction.reply({ content: `\\u23ed Skipped to: ${next.title}`, ephemeral: true });
    } else {
      await interaction.reply({ content: 'Queue is empty!', ephemeral: true });
    }
  } else if (interaction.customId.includes('stop')) {
    if (!player) return interaction.reply({ content: 'No music playing!', ephemeral: true });
    player.clearQueue();
    player.nowPlaying = null;
    player.isPlaying = false;
    await interaction.reply({ content: '\\u23f9 Stopped music and cleared queue', ephemeral: true });
  }
});

// Voice State Update (for leaving empty voice channels)
client.on('voiceStateUpdate', (oldState, newState) => {
  const voiceChannel = oldState.channel;
  if (voiceChannel && voiceChannel.members.filter(m => !m.user.bot).size === 0) {
    const player = client.players.get(voiceChannel.guild.id);
    if (player) {
      player.clearQueue();
      player.isPlaying = false;
      client.players.delete(voiceChannel.guild.id);
    }
  }
});

// Error Handling
process.on('unhandledRejection', error => {
  console.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
});

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

// Bot Login
client.login(process.env.DISCORD_TOKEN);
