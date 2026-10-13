# NEXO BOARD / NEXO MOBILE

Aplicativo de mapas de placas e esquemáticos. A mesma interface usa o nome **NEXO BOARD** no computador e **NEXO MOBILE** no iPhone. Esta cópia corresponde à versão GM `tools92` do projeto.

## Publicação no GitHub Pages

Em **Settings → Pages → Source**, selecione **GitHub Actions**. O workflow `.github/workflows/pages.yml` publica automaticamente a branch `main`; também pode ser iniciado manualmente pela aba Actions. O endereço final aparece em Settings → Pages.

O aplicativo funciona na subpasta do repositório. O manifesto, o service worker e os recursos usam caminhos relativos. Não é necessário domínio próprio nem instalação de pacotes npm.

## Instalar no iPhone

1. Abra o endereço do GitHub Pages no Safari com internet.
2. Use **Compartilhar → Adicionar à Tela de Início** e abra pelo novo ícone.
3. Em **Arquivos**, importe seu pacote ZIP completo ou receba a biblioteca pelo sincronizador com o NEXO local do PC.
4. Aguarde a preparação offline e a importação terminarem. Depois, placas, imagens e esquemáticos importados ficam no próprio aparelho.

O novo endereço possui armazenamento separado do site provisório: será necessário importar ou sincronizar a biblioteca **uma vez**. Não apague a instalação antiga antes de conferir seus dados no novo aplicativo. Guarde os ZIPs como cópia da biblioteca.

## Organização do código

- Os arquivos HTML, JavaScript, CSS, manifestos e ícones da raiz são o código editável do aplicativo.
- `app-files.json` lista exatamente os arquivos da raiz que devem ser publicados.
- `assets-01.zip`, `assets-02.zip` e os demais ZIPs de recursos têm até 4 MiB cada, para facilitar o envio pelo navegador. São arquivos ZIP independentes, com as pastas `vendor`, `schematics`, `schematics-pins`, `fontes-previas`, `jci-decodificado` e os três dados grandes da raiz: `board-dados.js`, `component-catalog.json` e `capacitor-catalog.json`. As licenças das dependências estão em `vendor` dentro desses recursos.
- `resources.json` registra os caminhos, tamanhos e hashes dos ZIPs e de cada arquivo contido neles. A montagem confere a integridade antes de publicar.
- `build-pages.mjs` monta a pasta `_site`, extrai os recursos e atualiza o cache offline.
- `build-offline.mjs` e `nexus-worker-runtime.js` geram o service worker clássico e autocontido. Não altere apenas o arquivo gerado `nexus-sw.js`.

Os scripts de montagem, este README e os ZIPs de recursos ficam no repositório, mas não são publicados como parte da aplicação. `NEXUS-ESP32.md` é documentação histórica do firmware já incluída no aplicativo; os nomes internos `Nexus` são preservados para manter compatibilidade com pacotes e dados existentes.

## Montar localmente

Requisitos: Node.js 22 e Python 3.9 ou superior. Execute:

```sh
node build-pages.mjs
```

No Windows, se `python` não estiver no PATH, defina a variável `PYTHON` com o caminho do executável. Sirva `_site` por HTTP em `localhost` para testar; abrir `index.html` diretamente como arquivo não permite instalar o PWA.

Ao adicionar um arquivo novo do aplicativo na raiz, inclua-o em `app-files.json`. Ao alterar recursos compactados, atualize o respectivo ZIP e seus tamanhos e hashes em `resources.json`, mantendo os caminhos internos. Cada montagem recalcula a versão do cache para atualizar instalações existentes.

## Biblioteca e comunicação com NEX-32

Este repositório inclui a prévia do iPhone 11. O pacote completo de placas de aproximadamente 1,3 GB permanece separado e **não é enviado ao GitHub**. A importação e a consulta offline usam o armazenamento do próprio navegador.

O GitHub Pages publica arquivos estáticos; não executa o servidor local do desktop nem o serviço de pareamento. A comunicação pela internet com o **NEX-32** e o pareamento do sincronizador continuam usando o serviço já existente em `https://iphone11-mapa-jonathan.macore-jonathan.chatgpt.site`, configurado em `rffe-relay-config.js`. O site provisório precisa permanecer ativo para essas funções. Os arquivos de biblioteca são transferidos diretamente entre os aparelhos pelo sincronizador; o serviço intermedeia o pareamento.

Nenhuma senha, chave privada, configuração privada de hospedagem ou banco do servidor integra esta exportação. O pareamento salvo pertence ao navegador e pode precisar ser feito novamente no novo endereço. A instalação no GitHub não apaga nem substitui a versão local do PC ou o site provisório.
