const express = require('express');
const cors = require('cors');
// Használjuk a discord.js 14-es verziójának megfelelő importokat
const { Client, GatewayIntentBits, PermissionsBitField, MessageEmbed, ActivityType } = require('discord.js'); 
const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const otherScript = require('./restart.js');

console.log("restart.js is running.");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const YOUR_USER_ID = '1095731086513930260'; // Ide kerül a te Discord ID-d

// --- Antilink beállítások (Változatlan) ---
let allowedLinks = [];
const allowedLinksFile = './liens.json';
if (fs.existsSync(allowedLinksFile)) {
    allowedLinks = JSON.parse(fs.readFileSync(allowedLinksFile, 'utf-8')).allowedLinks;
}
function saveAllowedLinks() {
    fs.writeFileSync(allowedLinksFile, JSON.stringify({ allowedLinks }, null, 2));
}
// --- Antilink vége ---


const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildPresences, // Ez kell az aktivitáshoz
        GatewayIntentBits.GuildMembers   // Ez kell a member.fetch-hez
    ] 
});

// --- Itt tároljuk a feldolgozott adatokat ---
let processedUserData = null;

/**
 * Ez az új, tiszta függvény, ami feldolgozza a jelenléti adatokat
 * és csak a lényeget adja vissza.
 */
function processPresence(member, presence) {
    // Ha nincs jelenlét (pl. felhasználó offline), null-t adunk vissza
    if (!presence && !member) return null;

    // A 'member' objektum fontosabb, mert tartalmazza a szerver-adatokat
    // De ha offline, a 'presence' lehet null, ezért a 'member'-t használjuk
    const user = member?.user;
    if (!user) return null; // Ha valamiért a felhasználó objektum hiányzik

    const activities = presence?.activities || [];
    
    // Keressük meg a különböző aktivitás típusokat
    // ActivityType.Listening = 2 (Spotify)
    const spotify = activities.find(act => act.type === ActivityType.Listening && act.name === 'Spotify');
    // ActivityType.Playing = 0 (Játék)
    const game = activities.find(act => act.type === ActivityType.Playing);
    // ActivityType.Custom = 4 (Egyéni állapot)
    const custom = activities.find(act => act.type === ActivityType.Custom);
    // ActivityType.Streaming = 1 (Streamelés)
    const streaming = activities.find(act => act.type === ActivityType.Streaming);

    // Banner lekérése a cache-ből (ezt a 'ready' event feltölti)
    const cachedUser = client.users.cache.get(user.id);
    const bannerUrl = cachedUser?.bannerURL({ dynamic: true, size: 1024 }) || null;

    return {
        // 1. Általános állapot
        status: presence?.status || 'offline',
        on_mobile: !!presence?.clientStatus?.mobile,
        on_desktop: !!presence?.clientStatus?.desktop,
        on_web: !!presence?.clientStatus?.web,

        // 2. Felhasználói adatok
        user_info: {
            id: user.id,
            username: user.username,
            global_name: user.globalName, // Az új "@" nélküli név
            display_name: member.displayName, // Nicknév vagy globális név
            avatar_url: user.displayAvatarURL({ dynamic: true, size: 512 }),
            banner_url: bannerUrl
        },

        // 3. Spotify (zene)
        spotify: spotify ? {
            title: spotify.details,
            artist: spotify.state,
            album: spotify.assets?.largeText || null,
            album_art_url: spotify.assets?.largeImageURL() || null,
            // Unix timestamp a dal kezdetéről/végéről
            timestamps: spotify.timestamps 
        } : null, // Ha nem hallgat zenét, ez null lesz

        // 4. Játék
        game: game ? {
            name: game.name,
            details: game.details,
            state: game.state,
            // Pl. "03:15 játszik"
            timestamps: game.timestamps ? game.timestamps : null, 
            assets: game.assets ? {
                large_image: game.assets.largeImageURL(),
                large_text: game.assets.largeText
            } : null
        } : null, // Ha nem játszik, ez null lesz

        // 5. Egyéni állapot
        custom_status: custom ? {
            text: custom.state,
            emoji: custom.emoji ? custom.emoji.name : null
        } : null, // Ha nincs egyéni állapot, ez null lesz

        // 6. Streamelés (pl. Twitch)
        streaming: streaming ? {
            title: streaming.details,
            game: streaming.state,
            url: streaming.url
        } : null // Ha nem streamel, ez null lesz
    };
}


client.once('ready', async () => {
    console.log(`Bot csatlakozva mint ${client.user.tag}!`);
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) {
        console.error(`Hiba: A bot nincs a(z) ${config.guildId} ID-jű szerveren!`);
        return;
    }

    try {
        // 1. Frissítjük a felhasználót a cache-ben (banner adatokért)
        await client.users.fetch(YOUR_USER_ID, { force: true });
        
        // 2. Lekérjük a szerver tag (member) adatokat
        const member = await guild.members.fetch(YOUR_USER_ID); 
        
        if (member) {
            // 3. Feldolgozzuk és elmentjük az adatokat
            processedUserData = processPresence(member, member.presence);
            if (processedUserData) {
                console.log(`Kezdő státusz sikeresen betöltve. Állapot: ${processedUserData.status}`);
            } else {
                console.log('Kezdő státusz betöltve, de a felhasználó valószínűleg offline.');
                // Ha offline, akkor is létrehozunk egy alap objektumot
                processedUserData = processPresence(member, null);
            }
        } else {
            console.error('A felhasználó nem található ezen a szerveren.');
        }
    } catch (error) {
        console.error('Hiba a kezdő státusz lekérése közben (ready event):', error);
    }

    // Slash parancs regisztrációja (Változatlan)
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
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
    // Csak a TE felhasználódra reagáljunk
    if (newPresence.userId !== YOUR_USER_ID) {
        return;
    }

    // A 'newPresence.member' tartalmazza a friss 'member' adatokat (pl. nicknév)
    // A 'newPresence' pedig a friss aktivitásokat.
    processedUserData = processPresence(newPresence.member, newPresence);
    console.log(`Státusz frissítve. Új állapot: ${processedUserData?.status}`);
});


// ----- WEBSZERVER ÉS API VÉGPONTOK -----

// A főoldal (Változatlan)
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

// A régi /api/status végpont (frissítve, hogy az új adatot használja)
app.get('/api/status', (req, res) => {
  res.json({
    status: processedUserData?.status || 'offline',
    userData: processedUserData
  });
});

// --- AZ ÚJ, TISZTA FŐ API VÉGPONT ---
app.get('/v1/users/:id', (req, res) => {
  console.log(`API kérés érkezett: ${req.params.id}`);
  
  // Csak a te ID-dat szolgáljuk ki ezen a végponton
  if (req.params.id === YOUR_USER_ID) {
    if (processedUserData) {
      // Ha az adat sikeresen be lett töltve, adjuk vissza
      res.json({
        success: true,
        data: processedUserData 
      });
    } else {
      // Ez akkor fordul elő, ha a bot még tölt
      res.status(503).json({ 
        success: false, 
        message: 'A felhasználói adatok még nem érhetőek el. A bot valószínűleg most indul.' 
      });
    }
  } else {
    // Ha más ID-t kérnek, visszautasítjuk
    res.status(404).json({ success: false, message: 'Felhasználó nem található (ez az API csak egy felhasználót figyel).' });
  }
});


// --- Antilink kód (Változatlan) ---
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
// --- Antilink kód vége ---

// --- INDÍTÁS ---
app.listen(PORT, () => {
  console.log(`Webszerver elindítva a(z) ${PORT} porton`);
});

client.login(process.env.CLIENT_TOKEN);
