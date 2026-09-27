const mineflayer = require('mineflayer');
const express = require('express');
const config = require('./settings.json');

const app = express();
const PORT = process.env.PORT || 5000;

const bots = [];

const server = {
  host: config.server.ip,
  port: Number(config.server.port),
  version: config.server.version
};

// ============================================================
// DASHBOARD
// ============================================================

app.get('/', (req, res) => {

  const botList = bots.map((b, i) => {

    const status = b.bot && b.botState.connected
      ? '🟢 Online'
      : '🔴 Offline';

    let coords = 'Unknown';

    if (b.bot && b.bot.entity) {
      const p = b.bot.entity.position;

      coords =
        `${Math.floor(p.x)}, ` +
        `${Math.floor(p.y)}, ` +
        `${Math.floor(p.z)}`;
    }

    return `
      <div style="
        background:#0f172a;
        padding:18px;
        margin:15px 0;
        border-radius:12px;
      ">
        <h2>Bot ${i + 1}</h2>

        <p>
          <b>Username:</b> ${b.username}
        </p>

        <p>
          <b>Status:</b> ${status}
        </p>

        <p>
          <b>Coordinates:</b> ${coords}
        </p>

        <p>
          <b>Reconnect Attempts:</b>
          ${b.reconnectAttempts}
        </p>
      </div>
    `;

  }).join('');

  res.send(`
<!DOCTYPE html>

<html>

<head>

<title>${config.name}</title>

<meta name="viewport"
content="width=device-width, initial-scale=1">

<style>

body {
  font-family: Arial;
  background:#020617;
  color:white;
  padding:20px;
}

.container {
  max-width:700px;
  margin:auto;
}

h1 {
  color:#2dd4bf;
}

</style>

</head>

<body>

<div class="container">

<h1>🤖 ${config.name}</h1>

<p>
Server:
${server.host}:${server.port}
</p>

${botList}

</div>

</body>

</html>
  `);
});

// ============================================================
// HEALTH
// ============================================================

app.get('/health', (req, res) => {

  res.json({

    server: server.host,

    bots: bots.map((b) => ({

      username: b.username,

      status:
        b.bot && b.botState.connected
          ? 'connected'
          : 'disconnected',

      reconnectAttempts:
        b.reconnectAttempts,

      coordinates:
        b.bot && b.bot.entity
          ? b.bot.entity.position
          : null

    }))

  });

});

// ============================================================
// PING
// ============================================================

app.get('/ping', (req, res) => {

  res.send('pong');

});

app.listen(PORT, '0.0.0.0', () => {

  console.log(
    `[WEB] Dashboard running on port ${PORT}`
  );

});

// ============================================================
// CREATE BOT
// ============================================================

function createBot(index) {

  const account = config.bots[index];

  if (!account) {
    return;
  }

  const botData = {

    username: account.username,

    password: account.password || '',

    type: account.type || 'offline',

    bot: null,

    reconnectAttempts: 0,

    reconnectTimer: null,

    botState: {
      connected: false
    }

  };

  bots[index] = botData;

  connectBot(botData, index);

}

// ============================================================
// CONNECT BOT
// ============================================================

function connectBot(botData, index) {

  console.log('');
  console.log(
    `[BOT ${index + 1}] Connecting as ${botData.username}...`
  );

  try {

    const bot = mineflayer.createBot({

      username: botData.username,

      password:
        botData.password || undefined,

      auth:
        botData.type || 'offline',

      host:
        server.host,

      port:
        server.port,

      version:
        server.version,

      hideErrors: false,

      checkTimeoutInterval: 120000

    });

    botData.bot = bot;

    // ========================================================
    // SPAWN
    // ========================================================

    bot.once('spawn', () => {

      botData.botState.connected = true;

      botData.reconnectAttempts = 0;

      console.log(
        `[BOT ${index + 1}] ✅ ${botData.username} connected!`
      );

      // Login/Register
      setupAuthentication(bot, botData);

      // Anti AFK
      startAntiAFK(bot, index);

    });

    // ========================================================
    // CHAT
    // ========================================================

    bot.on('messagestr', (message) => {

      const msg =
        String(message).toLowerCase();

      if (!botData.password) {
        return;
      }

      if (
        msg.includes('login') &&
        !msg.includes('logged')
      ) {

        bot.chat(
          `/login ${botData.password}`
        );

        console.log(
          `[BOT ${index + 1}] Login sent`
        );

      }

      else if (
        msg.includes('register')
      ) {

        bot.chat(
          `/register ${botData.password} ${botData.password}`
        );

        console.log(
          `[BOT ${index + 1}] Register sent`
        );

      }

    });

    // ========================================================
    // KICK
    // ========================================================

    bot.on('kicked', (reason) => {

      console.log(
        `[BOT ${index + 1}] Kicked:`,
        typeof reason === 'string'
          ? reason
          : JSON.stringify(reason)
      );

    });

    // ========================================================
    // ERROR
    // ========================================================

    bot.on('error', (error) => {

      console.log(
        `[BOT ${index + 1}] Error: ${error.message}`
      );

    });

    // ========================================================
    // DISCONNECT
    // ========================================================

    bot.on('end', (reason) => {

      botData.botState.connected = false;

      console.log(
        `[BOT ${index + 1}] Disconnected:`,
        reason || 'Unknown'
      );

      if (
        config.utils?.['auto-reconnect'] !== false
      ) {

        scheduleReconnect(
          botData,
          index
        );

      }

    });

  } catch (error) {

    console.log(
      `[BOT ${index + 1}] Failed: ${error.message}`
    );

    scheduleReconnect(
      botData,
      index
    );

  }

}

// ============================================================
// AUTHENTICATION
// ============================================================

function setupAuthentication(bot, botData) {

  if (!botData.password) {
    return;
  }

  console.log(
    `[AUTH] Authentication enabled for ${botData.username}`
  );

}

// ============================================================
// ANTI AFK
// ============================================================

function startAntiAFK(bot, index) {

  if (
    !config.utils?.['anti-afk']?.enabled
  ) {
    return;
  }

  const interval =
    Number(
      config.utils['anti-afk'].interval
    ) || 30000;

  setInterval(() => {

    if (
      !bot ||
      !bot.entity ||
      !bots[index] ||
      !bots[index].botState.connected
    ) {
      return;
    }

    try {

      bot.setControlState(
        'jump',
        true
      );

      setTimeout(() => {

        if (bot) {

          bot.setControlState(
            'jump',
            false
          );

        }

      }, 300);

    } catch {}

  }, interval);

  console.log(
    `[BOT ${index + 1}] Anti-AFK enabled`
  );

}

// ============================================================
// RECONNECT
// ============================================================

function scheduleReconnect(botData, index) {

  if (botData.reconnectTimer) {
    return;
  }

  botData.reconnectAttempts++;

  const delay =
    Number(
      config.utils?.['reconnect-delay']
    ) || 5000;

  console.log(
    `[BOT ${index + 1}] Reconnecting in ${delay / 1000}s...`
  );

  botData.reconnectTimer =
    setTimeout(() => {

      botData.reconnectTimer = null;

      connectBot(
        botData,
        index
      );

    }, delay);

}

// ============================================================
// START ALL BOTS
// ============================================================

console.log('');
console.log('====================================');
console.log('      MINECRAFT MULTI AFK BOT');
console.log('====================================');

console.log(
  `Server: ${server.host}:${server.port}`
);

console.log(
  `Bots: ${config.bots.length}`
);

config.bots.forEach((_, index) => {

  // Small delay so all accounts don't connect
  // at exactly the same moment.

  setTimeout(() => {

    createBot(index);

  }, index * 5000);

});

// ============================================================
// SHUTDOWN
// ============================================================

function shutdown(signal) {

  console.log(
    `[SYSTEM] ${signal} received.`
  );

  bots.forEach((data) => {

    if (data.bot) {

      try {
        data.bot.quit('Bot shutting down');
      } catch {}

    }

  });

  setTimeout(() => {

    process.exit(0);

  }, 1000);

}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);
