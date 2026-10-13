NEX-32 2.6 - NEXUS-PM

LISTA COM COMPARACAO
A pagina LISTA mostra os PAs esperados do RFFE selecionado no NEXUS-PM.
Depois de uma busca concluida, apenas o texto do USID muda de cor:
- Verde: USID esperado e encontrado.
- Vermelho: USID esperado e nao encontrado.
- Rosa: USID encontrado que nao estava na lista esperada (Nao esperado).
A ordem e numerica, de 0x1 a 0xF. Os nomes dos PAs continuam neutros.
Toque em um PA esperado para localiza-lo na placa do NEXUS-PM. Um USID
inesperado nao tem PA associado, portanto o toque nao aponta outra peca.
LISTA nunca inicia uma busca: INICIAR continua na pagina com a matriz.

Antes da primeira busca, durante uma busca incompleta ou ao trocar a placa/RFFE,
a lista fica neutra. Resultados de outro contexto nao sao reutilizados.
Uma busca interrompida nao transforma USIDs ainda nao testados em ausentes.
O resultado nao precisa ser enviado para ser comparado na tela do NEX-32.
ENVIAR continua sendo a acao que entrega a leitura ao NEXUS-PM.

PAREAMENTO PRESERVADO
A capacidade de ate 8 vinculos de navegador da versao 2.5 foi mantida. Atualizar nao exige
um novo pareamento se o vinculo continua valido. O nome local continua
astra-rffe.local e o ID Internet permanece igual; os nomes visuais agora sao
NEX-32 (aparelho) e NEXUS-PM (programa PC/mobile).
Desconectar no NEXUS-PM apenas pausa a reconexao. Para liberar uma vaga de
pareamento, use Desparear no NEXUS-PM. DESPAREAR no NEX-32 remove
todos os aparelhos salvos, como antes.

ATUALIZAR MANUALMENTE
Use RECUPERAR.cmd, modo que concluiu a gravacao anterior, e confira a porta USB.
Se precisar entrar em gravacao, segure BOOT ao conectar o USB e depois solte-o.
Depois da mensagem final de sucesso, aperte e solte RESET sem segurar BOOT se a
tela continuar apagada. Nao e necessario compilar no VS Code.
Nao use apagar toda a memoria. A faixa NVS com Wi-Fi e pareamento fica preservada.
A pasta ASTRA RFFE - ORIGINAL permanece intacta.

VALIDACAO
Firmware compilado para ESP32-S3. A comparacao passou em 1.343.537 verificacoes
C++, incluindo todos os 32768 conjuntos de USID e mudancas de contexto.
Scanner, pinos, touch, Wi-Fi e pareamentos foram preservados.
Nenhuma gravacao automatica foi feita. Confira a tela no aparelho apos atualizar.
