const { Client, Intents, Permissions, MessageEmbed } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');
const config = require('./config.json');
const keep_alive = require('./keep_alive.js')

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
let allowedLinks = [];
const allowedLinksFile = './liens.json';

if (fs.existsSync(allowedLinksFile)) {
    allowedLinks = JSON.parse(fs.readFileSync(allowedLinksFile, 'utf-8')).allowedLinks;
}

function saveAllowedLinks() {
    fs.writeFileSync(allowedLinksFile, JSON.stringify({ allowedLinks }, null, 2));
}

client.once('ready', async () => {
    console.log(`Connecté sur ${client.user.tag}!`);
    const guild = client.guilds.cache.get(config.guildId);
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

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'addlink') {
        if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
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
       const filter = msg => {
            return !msg.author.bot && !msg.member.permissions.has('ADMINISTRATOR') && /https?:\/\/\S+/gi.test(msg.content);
        };

        const collector = message.channel.createMessageCollector({
            filter,
            dispose: true // Required for message deletion
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

client.login(process.env.CLIENT_TOKEN);

const arizaki = `
 █████╗ ██████╗ ██╗███████╗ █████╗ ██╗  ██╗██╗
██╔══██╗██╔══██╗██║╚══███╔╝██╔══██╗██║ ██╔╝██║
███████║██████╔╝██║  ███╔╝ ███████║█████╔╝ ██║
██╔══██║██╔══██╗██║ ███╔╝  ██╔══██║██╔═██╗ ██║
██║  ██║██║  ██║██║███████╗██║  ██║██║  ██╗██║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝
\n 

Discord bot Anti-link v1.0 by Arizaki

Github: https://github.com/ArizakiDev/antilink-bot`;
console.log(arizaki);
