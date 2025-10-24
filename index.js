const express = require('express');
const cors = require('cors');
// --- JAVÍTVA: PermissionsBitField és EmbedBuilder importálása ---
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActivityType } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const otherScript = require('./restart.js');

console.log("restart.js is running.");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const YOUR_USER_ID = '1095731086513930260'; // A te ID-d

let allowedLinks = [];
const allowedLinksFile = './liens.json';

if (fs.existsSync(allowedLinksFile)) {
    allowedLinks = JSON.parse(fs.readFileSync(allowedLinksFile, 'utf-8')).allowedLinks;
}

function saveAllowedLinks() {
    fs.writeFileSync(allowedLinksFile, JSON.stringify({ allowedLinks }, null, 2));
}

const client = new Client({ intents: [
  GatewayIntentBits.Guilds, 
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildPresences,
  GatewayIntentBits.GuildMembers
] });

// --- JAVÍTVA: Ez az objektum fogja tárolni a feldolgozott adatokat ---
// Használjuk ugyanazt a struktúrát, mint az API válasz
let processedApiData = {
    success: true,
    data: {
        status: 'offline',
        discord_user: {},
        activities: [],
        // --- ÚJ: Hozzáadjuk a tiszta aktivitás mezőket ---
        spotify: null,
        game: null,
        custom_status: null
    }
};

/**
 * --- ÚJ FÜGGVÉNY ---
 * Ez a függvény dolgozza fel a nyers adatokat egy tiszta API válasszá.
 * Ez a kód "null-biztos", nem omlik össze.
 */
function processUserData(member, presence) {
    const user = member?.user || presence?.user;
    if (!user) return; // Ha nincs user adat, nem csinálunk semmit

    const activities = presence?.activities || [];

    // Aktivitások keresése
    const spotify = activities.find(act => act.type === ActivityType.Listening && act.name === 'Spotify');
    const game = activities.find(act => act.type === ActivityType.Playing);
    const custom = activities.find(act => act.type === ActivityType.Custom);

    // Adatok elmentése a központi változóba
    processedApiData = {
        success: true,
        data: {
            status: presence?.status || 'offline',
            discord_user: {
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.avatar,
                // --- JAVÍTVA: Biztonságos 'displayName' lekérés ---
                displayName: member?.displayName || user.globalName || user.username
            },
            // Nyers aktivitások (ha mégis kellene)
            activities: activities,
            
            // --- ÚJ: Feldolgozott adatok ---
            spotify: spotify ? {
                title: spotify.details,
                artist: spotify.state,
                album: spotify.assets?.largeText || null,
                album_art_url: spotify.assets?.largeImageURL() || null
            } : null,
            
            game: game ? {
                name: game.name,
                details: game.details,
                state: game.state
            } : null,
            
            custom_status: custom ? {
                text: custom.state,
                emoji: custom.emoji ? custom.emoji.name : null
            } : null
        }
    };
}


// --- JAVÍTOTT 'READY' ESEMÉNY ---
// Hozzáadva a kezdő státusz lekérése
client.once('ready', async () => {
    console.log(`Connected as ${client.user.tag}!`);
    const guild = client.guilds.cache.get(config.guildId);
    if (guild) {
        
        // --- ÚJ RÉSZ: Kezdő státusz lekérése ---
        try {
            console.log("Kezdő státusz lekérése...");
            const member = await guild.members.fetch(YOUR_USER_ID);
            if (member) {
                // Feldolgozzuk és elmentjük a kezdő adatokat
                processUserData(member, member.presence);
                console.log(`Kezdő státusz sikeresen beállítva: ${processedApiData.data.status}`);
            }
        } catch (e) {
            console.error("Hiba a kezdő státusz lekérése közben (valószínűleg offline):", e.message);
            // Ha a felhasználó offline, a 'processUserData' kezeli
            processUserData(null, null); 
        }
        // --- ÚJ RÉSZ VÉGE ---

        // Slash parancs létrehozása (ez maradt)
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

// --- JAVÍTOTT 'PRESENCEUPDATE' ESEMÉNY ---
// Ez a kód már "null-biztos" és nem omlik össze
client.on('presenceUpdate', (oldPresence, newPresence) => {
  if (newPresence.userId !== YOUR_USER_ID) {
    //   console.log('Presence update for a different user:', newPresence.userId);
      return; // Csak a te ID-dat figyeljük
  }

  // A 'newPresence.member' lehet 'null'. A 'processUserData' függvény ezt kezeli.
  processUserData(newPresence.member, newPresence);

  console.log(`User státusza változott: ${processedApiData.data.status}`);
  if (processedApiData.data.spotify) console.log(`---> Spotify észlelve: ${processedApiData.data.spotify.title}`);
  if (processedApiData.data.game) console.log(`---> Játék észlelve: ${processedApiData.data.game.name}`);
});


// ----- SAJÁT WEBOLDAL -----
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
            <a href="/v1/users/${YOUR_USER_ID}" target="_blank">/v1/users/:id</a><br>
            <br>
            Engedélyezett linkek száma: <b>${allowedLinks.length}</b>
          </div>
        </div>
      </body>
    </html>
  `);
});

// Statikus fájlok kiszolgálása
app.use(express.static(path.join(__dirname, 'public')));

// --- JAVÍTOTT API VÉGPONTOK ---

// Ez a végpont mostantól a feldolgozott adatokat használja
app.get('/api/status', (req, res) => {
  res.json({
    status: processedApiData.data.status,
    userData: processedApiData.data // A teljes feldolgozott adat
  });
});

// A fő végpont is a feldolgozott adatokat adja vissza
app.get('/v1/users/:id', (req, res) => {
  console.log(`Received request for user ID: ${req.params.id}`);
  if (req.params.id === YOUR_USER_ID) {
    // Közvetlenül a központi változót küldjük vissza
    res.json(processedApiData);
  } else {
    res.status(404).json({ success: false, message: 'User not found' });
  }
});

// --- JAVÍTOTT SLASH PARANCS ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'addlink') {
        // --- JAVÍTVA: PermissionsBitField.Flags.Administrator ---
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

// --- JAVÍTOTT ANTILINK ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (message.content.includes('http://') || message.content.includes('https://')) {
        const messageLinks = message.content.match(/(https?:\/\/[^\s]+)/g);
        const unauthorizedLinks = messageLinks.filter(link => {
            return !allowedLinks.some(allowedLink => link.includes(allowedLink));
        });
        if (unauthorizedLinks.length > 0) {
            await message.delete();
            const warningMessage = await message.channel.send(`<@${message.author.id}> A hivatkozások nem engedélyezettek.`);
            setTimeout(() => warningMessage.delete(), 5000);
            
            // --- JAVÍTVA: EmbedBuilder használata ---
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Bejegyzés törölve – A hivatkozás nem engedélyezett')
                .setDescription(`Üzenet törölve itt <#${message.channel.id}>`)
                .addFields(
                    { name: 'Felhasználó', value: `<@${message.author.id}>`, inline: true },
                    { name: 'Üzenet', value: message.content, inline: true },
                    { name: 'Jogosulatlan linkek', value: unauthorizedLinks.join('\n') }
                );

            const modLogChannel = message.guild.channels.cache.get(config.logs);
            if (modLogChannel) {
                modLogChannel.send({ embeds: [embed] });
            } else {
                message.channel.send('Jogosulatlan linkek');
            }
        }
    }
});

// --- PORTON INDÍTÁS ---
app.listen(PORT, () => {
  console.log(`Webserver running on port ${PORT}`);
});

client.login(process.env.CLIENT_TOKEN);
