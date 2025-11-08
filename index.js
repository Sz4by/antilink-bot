// 1. JAVÍTÁS: .env fájl betöltése (helyi teszteléshez)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
// 4. JAVÍTÁS: discord.js v14 importok (EmbedBuilder, PermissionsBitField)
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');
const path = require('path');
// 2. JAVÍTÁS: A config.json-ra már nincs szükség
// const config = require('./config.json');

console.log("Bot elindult.");

const app = express();
app.use(cors());

// A PORT-ot már helyesen az .env-ből olvasod
const PORT = process.env.PORT || 3000;

let allowedLinks = [];
const allowedLinksFile = './liens.json';

if (fs.existsSync(allowedLinksFile)) {
    allowedLinks = JSON.parse(fs.readFileSync(allowedLinksFile, 'utf-8')).allowedLinks;
}

function saveAllowedLinks() {
    fs.writeFileSync(allowedLinksFile, JSON.stringify({ allowedLinks }, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
    // 3. JAVÍTÁS: Hozzáadva a link-szűréshez
    GatewayIntentBits.MessageContent 
  ]
});

let currentStatus = 'offline';
let currentUserData = null;

client.once('ready', async () => {
    console.log(`Connected as ${client.user.tag}!`);
    // 2. JAVÍTÁS: Az .env-ből olvassa a GUILD_ID-t
    const guild = client.guilds.cache.get(process.env.GUILD_ID); 
    if (guild) {
        await guild.commands.create(
            new SlashCommandBuilder()
                .setName('addlink')
                .setDescription('Adjon hozzá egy hivatkozást az engedélyezett hivatkozások listájához')
                .addStringOption(option => 
                    option.setName('link')
                        .setDescription('A hozzáadandó link')
                        .setRequired(true)
                )
        );
    }
});

// ... (A 'presenceUpdate' és 'updateApiStatus' részek helyesek voltak, változatlanul hagyva) ...
client.on('presenceUpdate', (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.user) return;

  if (newPresence.user.id === '1095731086513930260') {
    currentStatus = newPresence.status || 'offline';

    currentUserData = {
      user: {
        username: newPresence.user.username,
        discriminator: newPresence.user.discriminator,
        avatar: newPresence.user.avatar
      },
      displayName: newPresence.member ? newPresence.member.displayName : newPresence.user.username,
      activities: newPresence.activities || []
    };
    
    // (A többi presenceUpdate kód változatlan)
    // ...
    updateApiStatus(currentUserData);
  } else {
    // console.log('Presence update for a different user:', newPresence.user.id);
  }
});

function updateApiStatus(userData) {
  const statusPayload = {
    status: currentStatus,
    userData: {
      username: userData.user.username,
      discriminator: userData.user.discriminator,
      avatar: userData.user.avatar,
      displayName: userData.displayName,
      activities: userData.activities,
    }
  };

  fetch('https://status-monitor-fsj4.onrender.com/v1/users/1095731086513930260', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(statusPayload),
  })
    .then(response => {
      if (!response.ok) {
        console.error(`API hiba: ${response.status} ${response.statusText}`);
        throw new Error(`API hiba: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      // console.log('API válasz:', data); 
    })
    .catch(error => {
      console.error('Hiba az API frissítésekor:', error);
    });
}
// ... (A webszerver és API végpontok részek helyesek voltak, változatlanul hagyva) ...
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Discord Bot & API</title>
        <style>
          body { font-family: Arial, sans-serif; background: #222; color: #eee; text-align: center; padding: 40px; }
          .card { background: #333; border-radius: 15px; padding: 30px; margin: auto; max-width: 420px; box-shadow: 0 2px 10px #0007; }
          h1 { color: #71b7ff; }
          .desc { font-size: 1.15em; color: #eee; margin-bottom: 20px; }
          a { color: #85d6ff; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🤖 Discord Bot & API</h1>
          <div class="desc">
            Ez a bot <b>online</b>.<br>
            <br>
            <b>API végpontok:</b> <br>
            <a href="/api/status" target="_blank">/api/status</a><br>
            <a href="/v1/users/1095731086513930260" target="_blank">/v1/users/:id</a><br>
            <br>
            Engedélyezett linkek száma: <b>${allowedLinks.length}</b>
          </div>
        </div>
      </body>
    </html>
  `);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json({
    status: currentStatus,
    userData: currentUserData
  });
});

app.get('/v1/users/:id', (req, res) => {
  console.log(`Received request for user ID: ${req.params.id}`);
  if (req.params.id === '1095731086513930260') {
    res.json({
      success: true,
      data: {
        status: currentStatus,
        discord_user: {
          username: currentUserData?.user?.username || '',
          discriminator: currentUserData?.user?.discriminator || '',
          avatar: currentUserData?.user?.avatar || '',
          displayName: currentUserData?.displayName || ''
        },
        activities: currentUserData?.activities || []
      }
    });
  } else {
    res.status(4404).json({ success: false, message: 'User not found' });
  }
});
// --- Slash parancs ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'addlink') {
        // 4. JAVÍTÁS: v14-es engedély ellenőrzés
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply('Nincs engedélye a parancs használatára.');
        }

        let newLink = interaction.options.getString('link');
        if (!newLink.startsWith('http://') && !newLink.startsWith('https://')) {
            newLink = 'https://' + newLink;
        }

        if (!allowedLinks.includes(newLink)) {
            allowedLinks.push(newLink);
            saveAllowedLinks();
            await interaction.reply(`A link ${newLink} felkerült az engedélyezett hivatkozások listájára.`);
        } else {
            await interaction.reply('Ez a hivatkozás már szerepel az engedélyezett hivatkozások listájában.');
        }
    }
});

// --- Linkek figyelése és tiltás ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    // 3. JAVÍTÁS: A MessageContent Intent miatt ez most már működni fog
    if (message.content.includes('http://') || message.content.includes('https://')) {
        const messageLinks = message.content.match(/(https?:\/\/[^\s]+)/g);
        const unauthorizedLinks = messageLinks.filter(link => {
            return !allowedLinks.some(allowedLink => link.includes(allowedLink));
        });
        if (unauthorizedLinks.length > 0) {
            await message.delete();
            const warningMessage = await message.channel.send(`<@${message.author.id}> A hivatkozások nem engedélyezettek.`);
            setTimeout(() => warningMessage.delete(), 5000);
            
            // 4. JAVÍTÁA: v14-es EmbedBuilder használata
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Bejegyzés törölve – A hivatkozás nem engedélyezett')
                .setDescription(`Üzenet törölve itt <#${message.channel.id}>`)
                .addFields( // v14-es mező hozzáadás
                    { name: 'Felhasználó', value: `<@${message.author.id}>`, inline: true },
                    { name: 'Üzenet', value: message.content, inline: true },
                    { name: 'Jogosulatlan linkek', value: unauthorizedLinks.join('\n') }
                );

            // 2. JAVÍTÁS: Az .env-ből olvassa a LOG_CHANNEL_ID-t
            const modLogChannel = message.guild.channels.cache.get(process.env.LOG_CHANNEL_ID); 
            if (modLogChannel) {
                modLogChannel.send({ embeds: [embed] });
            } else {
                console.error('HIBA: A LOG_CHANNEL_ID érvénytelen vagy nincs beállítva az .env-ben.');
                message.channel.send('Jogosulatlan linkek (log csatorna hiba).');
            }
        }
    }
});

// --- PORTON INDÍTÁS ---
app.listen(PORT, () => {
  console.log(`Webserver running on port ${PORT}`);
});

// --- BOT INDÍTÁSA (BEÉGETETT TOKEN TESZT) ---
console.log("Megpróbálok bejelentkezni a BEÉGETETT TOKENNEL (CSAK TESZT!)");
        
// Ide írd be a 70 karakteres, új tokenedet
const HARDCODED_TOKEN = "MTI2MzA0NjM0MTY4MTA5MDU5MA.G4R8op.edxfaPjSlEQM00v4s2EJuTGJAjcqFph7jVO1iE";

client.login(HARDCODED_TOKEN)
  .then(() => {
    console.log("✅ BEÉGETETT TOKEN SIKERES! A bot elindul. Várakozás a 'Ready' eseményre...");
  })
  .catch((error) => {
    // Ez akkor fut le, ha a token HIBÁS
    console.error("❌ BEÉGETETT TOKEN HIBA!");
    console.error(`Részletes hiba: ${error.message}`);
  });
