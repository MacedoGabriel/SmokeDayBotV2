# Deploy sem Docker na Oracle Ubuntu 20.04 Minimal

Este guia assume uma VM pequena, como `VM.Standard.E2.1.Micro`, com 1 OCPU e 1 GB de RAM.

Para essa maquina, a recomendacao e rodar o bot direto no sistema com `systemd`, sem Docker.

## Visao geral

O servidor precisa de:

- Node.js 22
- Git
- FFmpeg
- yt-dlp
- arquivo `.env` fora do Git
- servico `systemd`
- swap de 1 GB ou 2 GB

## 1. Atualizar o sistema

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git ffmpeg
```

## 2. Criar swap

Em uma VM com 1 GB de RAM, crie swap antes de instalar/buildar dependencias.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Verifique:

```bash
free -h
```

## 3. Instalar Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Verifique:

```bash
node --version
npm --version
```

O projeto usa Node 22 porque as versoes atuais de `@discordjs/voice` pedem Node mais recente.

## 4. Instalar yt-dlp

```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp
```

Verifique:

```bash
yt-dlp --version
```

## 5. Criar usuario do bot

```bash
sudo adduser --system --group --home /opt/smokedaybot smokedaybot
```

## 6. Baixar o projeto

Depois de subir o repositorio no GitHub:

```bash
sudo git clone https://github.com/SEU_USUARIO/SmokeDayBot.git /opt/smokedaybot/app
sudo chown -R smokedaybot:smokedaybot /opt/smokedaybot
```

## 7. Configurar `.env`

Crie o arquivo:

```bash
sudo -u smokedaybot cp /opt/smokedaybot/app/.env.example /opt/smokedaybot/app/.env
sudo nano /opt/smokedaybot/app/.env
```

Exemplo:

```env
DISCORD_TOKEN=token_do_bot
CLIENT_ID=application_id
COMMAND_DEPLOY_SCOPE=guild
GUILD_IDS=id_servidor_teste,id_servidor_principal
```

Proteja o arquivo:

```bash
sudo chmod 600 /opt/smokedaybot/app/.env
sudo chown smokedaybot:smokedaybot /opt/smokedaybot/app/.env
```

## 8. Instalar dependencias e buildar

```bash
cd /opt/smokedaybot/app
sudo -u smokedaybot npm ci
sudo -u smokedaybot npm run check
sudo -u smokedaybot npm run build
```

Registrar comandos slash:

```bash
sudo -u smokedaybot npm run deploy:commands:prod
```

Depois, remova dependencias de desenvolvimento:

```bash
sudo -u smokedaybot npm prune --omit=dev
```

## 9. Criar servico systemd

Crie o arquivo:

```bash
sudo nano /etc/systemd/system/smokedaybot.service
```

Conteudo:

```ini
[Unit]
Description=SmokeDayBot Discord music bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=smokedaybot
Group=smokedaybot
WorkingDirectory=/opt/smokedaybot/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/smokedaybot/app

[Install]
WantedBy=multi-user.target
```

Ative:

```bash
sudo systemctl daemon-reload
sudo systemctl enable smokedaybot
sudo systemctl start smokedaybot
```

Ver logs:

```bash
sudo journalctl -u smokedaybot -f
```

Status:

```bash
sudo systemctl status smokedaybot
```

## 10. Atualizar o bot

```bash
cd /opt/smokedaybot/app
sudo systemctl stop smokedaybot
sudo -u smokedaybot git pull
sudo -u smokedaybot npm ci
sudo -u smokedaybot npm run check
sudo -u smokedaybot npm run build
sudo -u smokedaybot npm run deploy:commands:prod
sudo -u smokedaybot npm prune --omit=dev
sudo systemctl start smokedaybot
```

## 11. Atualizar yt-dlp

Se o YouTube parar de resolver links:

```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp
sudo systemctl restart smokedaybot
```

## Observacoes para VM pequena

- Evite Docker nessa maquina se a RAM estiver apertada.
- Mantenha o bot em poucos servidores.
- Use `COMMAND_DEPLOY_SCOPE=guild`, nao `global`, durante desenvolvimento.
- Evite tocar multiplos streams ao mesmo tempo.
- Acompanhe memoria com `free -h` e processo com `top` ou `htop`.
