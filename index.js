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
                .setDescription('Ajouter un lien à la liste des liens autorisés')
                .addStringOption(option => 
                    option.setName('lien')
                        .setDescription('Le lien à ajouter')
                        .setRequired(true)
                )
        );
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'addlink') {
        if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
            return interaction.reply('Vous n\'avez pas la permission d\'utiliser cette commande.');
        }

        let newLink = interaction.options.getString('lien');
        if (!newLink.startsWith('http://') && !newLink.startsWith('https://')) {
            newLink = 'https://' + newLink;
        }

        if (!allowedLinks.includes(newLink)) {
            allowedLinks.push(newLink);
            saveAllowedLinks();
            await interaction.reply(`Le lien ${newLink} a été ajouté à la liste des liens autorisés.`);
        } else {
            await interaction.reply('Ce lien est déjà dans la liste des liens autorisés.');
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
            const warningMessage = await message.channel.send(`<@${message.author.id}> Les liens ne sont pas autorisés.`);
            setTimeout(() => warningMessage.delete(), 5000);
            const embed = new MessageEmbed()
                .setColor('#FF0000')
                .setTitle('Message Supprimé - Lien Non Autorisé')
                .setDescription(`Message supprimé dans <#${message.channel.id}>`)
                .addField('Utilisateur', `<@${message.author.id}>`, true)
                .addField('Message', message.content, true)
                .addField('Liens Non Autorisés', unauthorizedLinks.join('\n'));

            const modLogChannel = message.guild.channels.cache.get(config.logs);
            if (modLogChannel) {
                modLogChannel.send({ embeds: [embed] });
            } else {
                message.channel.send('Canal de logs non trouvé.');
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
