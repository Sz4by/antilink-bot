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

// --- ÚJ, KÖZPONTI ADAT TÁROLÓ ---
// Ez fogja tárolni a feldolgozott adatokat, amiket az API visszaad.
let currentUserData = null;

// --- ÚJ, BŐVÍTETT ADATKINYERŐ FÜGGVÉNY ---
// Ez a függvény felelős azért, hogy a Discord objektumokból
// egy tiszta, JSON-barát objektumot hozzon létre.
function extractPresenceData(member, presence) {
    const user = member?.user || presence?.user;
    // Ha valamiért nem kapunk user objektumot, nem tudunk mit feldolgozni
    if (!user) return null; 

    const activities = presence?.activities || [];
    
    // Keressük meg a különböző aktivitás típusokat
    const spotify = activities.find(activity => activity.name === 'Spotify' && activity.type === 2); // 2 = Listening
    const game = activities.find(activity => activity.type === 0); // 0 = Playing
    const customStatus = activities.find(activity => activity.type === 4); // 4 = Custom Status
    const streaming = activities.find(activity => activity.type === 1); // 1 = Streaming

    return {
        // Általános állapot
        status: presence?.status || 'offline',
        client_status: presence?.clientStatus || null, // Pl. { desktop: 'online', mobile: 'dnd' }

        // Discord Felhasználói adatok (globális)
        discord_user: {
            id: user.id,
            username: user.username,
            global_name: user.globalName, // Az új "@" nélküli név
            discriminator: user.discriminator, // "0" vagy a régi 4 számjegy
            avatar_url: user.displayAvatarURL({ dynamic: true, size: 1024 }),
            banner_url: user.bannerURL({ dynamic: true, size: 1024 }) || null,
            accent_color: user.accentColor ? `#${user.accentColor.toString(16)}` : null
        },

        // Szerver-specifikus adatok (member)
        server_member: member ? {
            display_name: member.displayName, // Nicknév, vagy ha nincs, a globális név
            nickname: member.nickname || null, // Csak a nicknév
            server_avatar_url: member.displayAvatarURL({ dynamic: true, size: 1024 }), // Szerver-specifikus avatar
            joined_at: member.joinedTimestamp, // Mikor lépett a szerverre (Unix timestamp)
            roles: member.roles.cache
                .filter(r => r.name !== '@everyone')
                .sort((a, b) => b.position - a.position) // Rangsorolás (legmagasabb elöl)
                .map(role => ({
                    id: role.id,
                    name: role.name,
                    color: role.hexColor
                }))
        } : null,

        // Feldolgozott aktivitások
        activities: {
            spotify: spotify ? {
                track_id: spotify.syncId,
                title: spotify.details,
                artist: spotify.state,
                album: spotify.assets?.largeText || null,
                album_art_url: spotify.assets?.largeImageURL() || null,
                timestamps: spotify.timestamps // { start, end }
            } : null,
            game: game ? {
                name: game.name,
                details: game.details,
                state: game.state,
                timestamps: game.timestamps,
                assets: game.assets ? {
                    large_image: game.assets.largeImageURL(),
                    large_text: game.assets.largeText,
                    small_image: game.assets.smallImageURL(),
                    small_text: game.assets.smallText
                } : null
            } : null,
            custom_status: customStatus ? {
                state: customStatus.state,
                emoji: customStatus.emoji ? {
                    name: customStatus.emoji.name,
                    id: customStatus.emoji.id,
                    animated: customStatus.emoji.animated,
                    url: customStatus.emoji.url
                } : null
            } : null,
            streaming: streaming ? {
                name: streaming.name,
                details: streaming.details,
                url: streaming.url
            } : null
        },
        // Nyers aktivitás tömb, hibakereséshez
        raw_activities: activities 
    };
}


// --- FRISSÍTETT 'READY' ESEMÉNY ---
client.once('ready', async () => {
    console.log(`Connected as ${client.user.tag}!`);
    const guild = client.guilds.cache.get(config.guildId);
    if (guild) {
        try {
            // Frissítsük a felhasználót a cache-ben, hogy a banner adatok biztosan meglegyenek
            // Ezt csak egyszer, indításkor csináljuk, hogy ne terheljük az API-t
            await client.users.fetch('1095731086513930260', { force: true });
            
            // Most kérjük le a szerver-specifikus 'member' adatokat
            const member = await guild.members.fetch('1095731086513930260'); 
            
            if (member) {
                // Feldolgozzuk és elmentjük az adatokat a központi változóba
                currentUserData = extractPresenceData(member, member.presence);
                console.log(`Kezdő státusz sikeresen beállítva: ${currentUserData?.status}`);
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

// --- FRISSÍTETT 'PRESENCEUPDATE' ESEMÉNY ---
client.on('presenceUpdate', (oldPresence, newPresence) => {
  // Csak akkor fussunk le, ha a mi felhasználónkról van szó
  if (!newPresence || !newPresence.user || newPresence.user.id !== '1095731086513930260') {
    return;
  }
  
  // Használjuk ugyanazt a feldolgozó függvényt, mint indításkor
  // A 'newPresence.member' tartalmazza a friss 'member' adatokat
  currentUserData = extractPresenceData(newPresence.member, newPresence);
  console.log(`User státusza változott: ${currentUserData?.status}`);
});


// ----- SAJÁT WEBOLDAL -----
// (Ez a rész változatlan maradt)
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

// Statikus fájlok kiszolgálása (maradhat, ha van public mappád)
app.use(express.static(path.join(__dirname, 'public')));

// --- API végpontok ---

// Ez a végpont változatlan maradt, bár lehet, hogy már nincs rá szükséged
app.get('/api/status', (req, res) => {
  res.json({
    // A régi 'currentStatus' változó már nem létezik,
    // használjuk az új adatobjektumot
    status: currentUserData?.status || 'offline',
    userData: currentUserData // Visszaadjuk az egész új objektumot
  });
});

// --- FRISSÍTETT FŐ API VÉGPONT ---
app.get('/v1/users/:id', (req, res) => {
  console.log(`Received request for user ID: ${req.params.id}`);
  
  if (req.params.id === '1095731086513930260') {
    if (currentUserData) {
      // Ha az adat sikeresen be lett töltve, adjuk vissza az egészet
      res.json({
        success: true,
        data: currentUserData 
      });
    } else {
      // Ez akkor fordul elő, ha a bot még tölt, vagy nem találta meg a felhasználót
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
// (Ez a rész változatlan maradt)
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'addlink') {
        // --- JAVÍTVA ITT (Permissions.FLAGS.ADMINISTRATOR -> PermissionsBitField.Flags.Administrator) ---
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
// (Ez a rész változatlan maradt)
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
                    
