const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, PermissionsBitField, MessageEmbed } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
// Elindítjuk a másik szkriptet szinkron módon
const otherScript = require('./restart.js');

console.log("restart.js is running.");


const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

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
  GatewayIntentBits.GuildPresences, // Ez kell az aktivitáshoz
  GatewayIntentBits.GuildMembers   // Ez kell a member.fetch-hez
] });

// --- KÖZPONTI ADAT TÁROLÓ ---
let currentUserData = null;

// --- ÚJ, LANYARD-STÍLUSÚ ADATKINYERŐ FÜGGVÉNY ---
function extractPresenceData(member, presence) {
    const user = member?.user || presence?.user;
    if (!user) return null; 

    const activities = presence?.activities || [];
    const status = presence?.status || 'offline';
    const clientStatus = presence?.clientStatus || {}; // Pl. { desktop: 'dnd', mobile: 'online' }

    // Keressük meg a Spotify aktivitást
    const spotifyActivity = activities.find(activity => activity.name === 'Spotify' && activity.type === 2);
    
    // Banner lekérése a cache-ből (ezt a 'ready' event feltölti)
    // Ez azért kell, mert a 'presence.user' objektum nem mindig tartalmazza
    const cachedUser = client.users.cache.get(user.id);
    const bannerUrl = cachedUser?.bannerURL({ dynamic: true, size: 1024 }) || null;

    return {
        // Ezek azok a mezők, amiket kértél a Lanyard JSON alapján:
        kv: {}, // A Lanyard struktúra alapján üres objektum
        
        discord_user: {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            discriminator: user.discriminator,
            bot: user.bot,
            global_name: user.globalName || null,
            
            // Ezek nem voltak benne a Lanyard listában, de hasznosak
            // és a 'discord_user' részhez tartoznak:
            display_name: member?.displayName || user.globalName || user.username,
            avatar_url: user.displayAvatarURL({ dynamic: true, size: 1024 }),
            banner_url: bannerUrl 
            // Megjegyzés: A 'clan', 'collectibles', 'avatar_decoration_data' stb.
            // mezőket egy egyszerű bot nem tudja lekérni, azokhoz
            // speciális Lanyard-funkciók kellenek.
        },
        
        activities: activities, // A nyers aktivitás lista, pont mint a Lanyard-ban
        
        discord_status: status,
        
        // Kliens állapotok
        active_on_discord_web: !!clientStatus.web,
        active_on_discord_desktop: !!clientStatus.desktop,
        active_on_discord_mobile: !!clientStatus.mobile,

        // Spotify adatok
        listening_to_spotify: !!spotifyActivity, // true vagy false
        spotify: spotifyActivity ? {
            track_id: spotifyActivity.syncId,
            title: spotifyActivity.details,
            artist: spotifyActivity.state,
            album: spotifyActivity.assets?.largeText || null,
            album_art_url: spotifyActivity.assets?.largeImageURL() || null,
            timestamps: spotifyActivity.timestamps // { start, end }
        } : null
    };
}


// --- 'READY' ESEMÉNY ---
client.once('ready', async () => {
    console.log(`Connected as ${client.user.tag}!`);
    const guild = client.guilds.cache.get(config.guildId);
    if (guild) {
        try {
            // A 'force: true' frissíti a usert a cache-ben, így kapunk banner adatot
            await client.users.fetch('1095731086513930260', { force: true });
            
            const member = await guild.members.fetch('1095731086513930260'); 
            
            if (member) {
                // Feldolgozzuk és elmentjük az adatokat az új Lanyard-stílusú függvénnyel
                currentUserData = extractPresenceData(member, member.presence);
                console.log(`Kezdő státusz sikeresen beállítva (Lanyard stílus): ${currentUserData?.discord_status}`);
            } else {
                console.log('A felhasználó (1095731086513930260) nem tagja a(z) ${config.guildId} szervernek.');
                currentUserData = null;
            }
        } catch (error) {
            console.error('Hiba a tag (member) lekérése közben (ready event):', error);
            currentUserData = null;
        }

        // Slash parancs regisztrációja (ez változatlan)
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

// --- 'PRESENCEUPDATE' ESEMÉNY ---
client.on('presenceUpdate', (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.user || newPresence.user.id !== '1095731086513930260') {
    return;
  }
  
  // Használjuk ugyanazt a feldolgozó függvényt
  currentUserData = extractPresenceData(newPresence.member, newPresence);
  console.log(`User státusza változott (Lanyard stílus): ${currentUserData?.discord_status}`);
});


// ----- SAJÁT WEBOLDAL -----
// (Változatlan)
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

// Statikus fájlok kiszolgálása
app.use(express.static(path.join(__dirname, 'public')));

// --- API végpontok ---

// A régi /api/status végpont
app.get('/api/status', (req, res) => {
  res.json({
    status: currentUserData?.discord_status || 'offline',
    userData: currentUserData // Visszaadjuk az egész új objektumot
  });
});

// --- A FŐ API VÉGPONT (LANYARD STÍLUSBAN) ---
app.get('/v1/users/:id', (req, res) => {
  console.log(`Received request for user ID: ${req.params.id}`);
  
  if (req.params.id === '1095731086513930260') {
    if (currentUserData) {
      // Itt adjuk vissza a kért "success: true" és "data: {...}" struktúrát
      res.json({
        success: true,
        data: currentUserData 
      });
    } else {
      // Hiba, ha a bot még tölt
      res.status(503).json({ 
        success: false, 
        message: 'User data is not available yet. The bot might be starting or the user was not found.' 
      });
    }
  } else {
    res.status(404).json({ success: false, message: 'User not found' });
  }
});


// --- Slash parancs ---
// (Változatlan)
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'addlink') {
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
// (Változatlan)
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
            const embed = new MessageEmbed()
                .setColor('#FF0000')
                .setTitle('Bejegyzés törölve – A hivatkozás nem engedélyezett')
                .setDescription(`Üzenet törölve itt <#${message.channel.id}>`)
                .addField('Felhasználó', `<@${message.author.id}>`, true)
                .addField('Üzenet', message.content, true)
                .addField('Jogosulatlan linkek', unauthorizedLinks.join('\n'));

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
