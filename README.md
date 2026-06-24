# SmokeDayBot

Bot privado de Discord para tocar audio em canal de voz.

O projeto roda em Docker para manter o ambiente igual entre Windows e Linux, com Node.js, FFmpeg e yt-dlp dentro do container. A primeira versao suporta:

- `/ping`: verifica se o bot esta online.
- `/join`: entra no canal de voz em que o usuario esta.
- `/leave`: sai do canal de voz.
- `/play url:<youtube-url>`: toca audio de um video do YouTube sem baixar arquivo local.
- `/play arquivo:<arquivo>`: toca um arquivo local em `assets/audio`.
- `/live url:<youtube-live-url>`: toca uma live do YouTube.
- `/queue`: mostra o audio atual e as proximas faixas.
- `/skip`: pula para a proxima faixa da fila.
- `/stop`: para o audio atual e limpa a fila sem sair do canal.

## Stack

- Node.js 22
- TypeScript
- discord.js
- @discordjs/voice
- FFmpeg
- yt-dlp
- Docker / Docker Compose

## Requisitos locais

- Docker Desktop funcionando com engine Linux/WSL2.
- Bot criado no Discord Developer Portal.
- Bot instalado no servidor Discord com permissoes de voz.

Para validar o Docker:

```powershell
docker run --rm hello-world
```

## Configuracao do Discord

Crie uma aplicacao em:

```txt
https://discord.com/developers/applications
```

No bot, copie:

- `DISCORD_TOKEN`: token do bot.
- `CLIENT_ID`: Application ID.
- `GUILD_IDS`: IDs dos servidores onde os comandos devem ser registrados.

Para adicionar o bot em um servidor, use uma URL OAuth2 com os scopes:

- `bot`
- `applications.commands`

Permissoes recomendadas:

- View Channels
- Send Messages
- Connect
- Speak

Exemplo de URL:

```txt
https://discord.com/oauth2/authorize?client_id=SEU_CLIENT_ID&permissions=3148800&scope=bot%20applications.commands
```

## Variaveis de ambiente

Copie o exemplo:

```powershell
copy .env.example .env
```

Edite o `.env`:

```env
DISCORD_TOKEN=token_do_bot
CLIENT_ID=application_id

COMMAND_DEPLOY_SCOPE=guild
GUILD_IDS=id_servidor_teste,id_servidor_principal
```

Durante desenvolvimento, use:

```env
COMMAND_DEPLOY_SCOPE=guild
```

Esse modo registra os comandos rapidamente apenas nos servidores listados em `GUILD_IDS`.

Tambem existe:

```env
COMMAND_DEPLOY_SCOPE=global
```

Use global apenas quando os comandos estiverem estaveis. Comandos globais podem demorar mais para aparecer ou atualizar no Discord.

Nunca commite o arquivo `.env`.

## Rodando em desenvolvimento

Build da imagem:

```powershell
docker compose build
```

Subir o bot:

```powershell
docker compose up
```

Subir em segundo plano:

```powershell
docker compose up -d
```

Ver logs:

```powershell
docker compose logs -f bot
```

Parar:

```powershell
docker compose down
```

## Registrar comandos slash

Sempre que criar ou alterar comandos, rode:

```powershell
docker compose run --rm bot npm run deploy:commands
```

O terminal deve mostrar algo parecido com:

```txt
Guild commands deployed successfully.
```

Depois disso, o comando deve aparecer no Discord.

## Testes e diagnostico

Validar TypeScript:

```powershell
docker compose exec bot npm run check
```

Validar ferramentas do container:

```powershell
docker compose exec bot npm run doctor
```

O `doctor` deve mostrar versoes de:

- Node.js
- npm
- FFmpeg
- yt-dlp

## Audio local

Coloque arquivos em:

```txt
assets/audio
```

Extensoes aceitas:

- `.mp3`
- `.m4a`
- `.mp4a`
- `.mp4`
- `.wav`
- `.ogg`

Uso:

```txt
/play arquivo:nome-do-arquivo.mp3
```

Se houver apenas um arquivo local, `/play` sem argumentos toca esse arquivo.

## YouTube

Uso:

```txt
/play url:https://www.youtube.com/watch?v=n4tK7LYFxI0
```

O bot usa `yt-dlp` para resolver o stream de audio e toca direto pelo Discord. Ele nao baixa o video inteiro para um arquivo local. Se ja houver audio tocando, `/play` adiciona a nova faixa na fila.

O formato preferido e:

```txt
bestaudio[acodec=opus][ext=webm]/bestaudio
```

Quando o YouTube entrega `webm/opus`, o bot envia o stream de forma mais leve. Para outros formatos, o `@discordjs/voice` pode usar FFmpeg na pipeline.

Para testar manualmente o yt-dlp:

```powershell
docker compose exec bot yt-dlp --js-runtimes node --get-title "URL_DO_YOUTUBE"
```

```powershell
docker compose exec bot yt-dlp --js-runtimes node -f "bestaudio[acodec=opus][ext=webm]/bestaudio" --no-playlist --get-url "URL_DO_YOUTUBE"
```

Se o segundo comando retornar uma URL `googlevideo.com`, o yt-dlp conseguiu resolver o stream.

## YouTube Live

Uso:

```txt
/live url:https://www.youtube.com/watch?v=vTnBwT_hN5o
```

Lives usam um fluxo diferente de videos comuns. O comando `/live` pede ao `yt-dlp` o formato:

```txt
bestaudio/best
```

Normalmente isso retorna uma playlist HLS `.m3u8`, e o FFmpeg abre essa playlist para enviar audio ao Discord.

Lives nao entram na fila nesta versao. `/live` toca imediatamente e substitui o audio atual.

Teste manual:

```powershell
docker compose exec bot yt-dlp --js-runtimes node -f "bestaudio/best" --no-playlist --get-url "URL_DA_LIVE"
```

## Estrutura do projeto

```txt
assets/audio/              arquivos locais de teste
scripts/doctor.mjs         diagnostico do ambiente
src/audio/                 player e audio local
src/commands/              slash commands
src/playback/              estado de reproducao por servidor
src/voice/                 conexao com canal de voz
src/youtube/               resolucao de audio do YouTube via yt-dlp
src/config.ts              leitura do .env
src/deploy-commands.ts     deploy dos slash commands
src/index.ts               bootstrap do bot
```

## Scripts npm

```txt
npm run dev              roda o bot com nodemon
npm run check            valida TypeScript
npm run build            compila para dist
npm run doctor           valida Node, npm, FFmpeg e yt-dlp
npm run deploy:commands  registra slash commands no Discord
npm run deploy:commands:prod  registra comandos usando o build em dist
```

Normalmente, rode esses scripts via Docker:

```powershell
docker compose exec bot npm run check
```

ou:

```powershell
docker compose run --rm bot npm run deploy:commands
```

## Troubleshooting

### O comando aparece no Discord, mas responde "Comando desconhecido"

O Discord recebeu o comando, mas o processo do bot ainda esta com codigo antigo.

Rode:

```powershell
docker compose restart bot
```

E confira:

```powershell
docker compose logs -f bot
```

Os logs devem mostrar:

```txt
Loaded commands: ping, join, leave, play, live, queue, skip, stop
```

### O comando nao aparece no Discord

Rode novamente:

```powershell
docker compose run --rm bot npm run deploy:commands
```

Confira se `GUILD_IDS` contem o ID do servidor correto.

### O bot nao entra no canal de voz

Confira se:

- voce esta em um canal de voz comum;
- o bot esta no servidor;
- o bot tem permissao `Connect`;
- o bot tem permissao `Speak`.

### yt-dlp mostra aviso sobre JavaScript runtime

Use sempre:

```txt
--js-runtimes node
```

O codigo do bot ja usa essa opcao.

### YouTube parou de resolver links

O YouTube muda com frequencia. Rebuildar a imagem baixa uma versao nova do yt-dlp:

```powershell
docker compose build --no-cache
docker compose up -d --force-recreate
```

## Producao

Para hospedar em uma VPS pequena, mantenha o bot enxuto:

- use Docker ou systemd;
- limite o uso a poucos servidores;
- evite cache grande em memoria;
- acompanhe logs;
- crie swap se a maquina tiver pouca RAM.

Para rodar em segundo plano:

```powershell
docker compose up -d
```

Para atualizar comandos depois de mudar o codigo:

```powershell
docker compose run --rm bot npm run deploy:commands
docker compose restart bot
```

Para deploy sem Docker na Oracle Ubuntu 20.04 Minimal, veja:

```txt
docs/oracle-ubuntu-20.04-deploy.md
```
