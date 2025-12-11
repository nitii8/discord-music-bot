# Discord Music Bot (example)

A concise Discord music bot example using discord.js v14 and @discordjs/voice. The goal is a small, readable project you can run locally for testing and learning.

Setup
1. Copy config.example.json to config.json and fill in your bot token and owner ID.
2. npm install
3. npm start

Notes
- This project is intentionally minimal. For a production bot you should add better error handling, per-guild players, rate-limiting and permissions checks.
- Respect Discord and YouTube terms of service when streaming content.

Commands
- !play <query|url> — play a YouTube URL or search term
- !skip — skips the current track
- !stop — stops and clears the queue
- !queue — shows upcoming tracks
- !now — shows currently playing track

If you'd like me to push these to a different branch or add TypeScript, unit tests, or CI, tell me which branch and I'll continue.
