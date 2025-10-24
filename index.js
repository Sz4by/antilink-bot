const express = require('express');
const cors = require('cors');
// --- JAVÍTVA ITT (Permissions -> PermissionsBitField) ---
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

let currentStatus = 'offline';
let currentUserData = null;

client.once('ready', async () => {
    console.log(`Connected as ${client.user.tag}!`);
    const guild = client.guilds.cache.get(config.guildId);
    if (guild) {

        // --- ÚJ RÉSZ ---
        // Kezdő státusz lekérése indításkor, hogy az API azonnal naprakész legyen.
        try {
            // A '1095731086513930260' ID-jű felhasználónak
            // a 'config.guildId' által meghatározott szerveren kell lennie.
            const member = await guild.members.fetch('1095731086513930260'); 
            
            // Ellenőrizzük, hogy a felhasználó online-e és van-e jelenléte
            if (member && member.presence) {
                console.log('Kezdő státusz sikeresen lekérve (ready event).');
                currentStatus = member.presence.status || 'offline';
                currentUserData = {
                    user: {
                        username: member.user.username,
                        discriminator: member.user.discriminator,
                        avatar: member.user.avatar
                    },
                    displayName: member.displayName || member.user.username,
                    activities: member.presence.activities || []
                };
                console.log(`Kezdő státusz beállítva: ${currentStatus}`, currentUserData.activities);
            } else if (member) {
                 // A felhasználó megvan, de offline (nincs 'presence' adat)
                console.log('A felhasználó offline (ready event).');
                currentStatus = 'offline';
                currentUserData = {
                    user: {
                        username: member.user.username,
                        discriminator: member.user.discriminator,
                        avatar: member.user.avatar
                    },
                    displayName: member.displayName || member.user.username,
                    activities: []
                };
            } else {
                console.log('Nem sikerült lekérni a kezdő státuszt (a felhasználó offline vagy nincs jelenlét?).');
                currentStatus = 'offline';
                currentUserData = null;
            }
        } catch (error) {
            console.error('Hiba a tag (member) lekérése közben (ready event):', error);
            console.log('Győződj meg róla, hogy a "SERVER MEMBERS INTENT" is engedélyezve van a Discord portálon!');
            currentStatus = 'offline';
            currentUserData = null;
        }
        // --- ÚJ RÉSZ VÉGE ---


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

client.on('presenceUpdate', (oldPresence, newPresence) => {
  console.log('presenceUpdate event fired for user:', newPresence?.user?.id);
  if (!newPresence || !newPresence.user) return;

  if(newPresence.user.id === '1095731086513930260') {
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

    console.log(`User státusza változott: ${currentStatus}`, currentUserData);
  } else {
    // console.log('Presence update for a different user:', newPresence.user.id); // Ezt kikommentelheted, ha nem kell a log
  }
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
    res.status(404).json({ success: false, message: 'User not found' });
  }
});

// --- Slash parancs ---
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
