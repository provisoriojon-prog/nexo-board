(function (root, factory) {
 'use strict';
 const api = factory();
 if (typeof module === 'object' && module.exports) module.exports = api;
 if (root) root.NexusChargingResearch86 = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
 'use strict';

 const PDF = 'jci-decodificado/iphone11-esquema-recuperado.pdf';
 const sourceDefinitions = {
  schematic: {title:'iPhone 11 · esquema e geometria',url:PDF,scope:'iphone11-schematic',note:'Confirma nomes de redes, pads e funções dos terminais deste mapa. Não é uma captura do aparelho em funcionamento.'},
  nyansatan: {title:'NyanSatan · Apple Lightning',url:'https://nyansatan.github.io/lightning/',scope:'historical',note:'Investigação de 2020 sobre a família Tristar/Hydra. Os exemplos de negociação não definem a sequência universal do iPhone 11.'},
  tamarin: {title:'stacksmashing · Tamarin, implementação IDBUS',url:'https://github.com/stacksmashing/tamarin-firmware/blob/5d4a559a6bd34781ab21a38bf5dc151e61749f37/main.c',scope:'historical',note:'Implementação experimental de acessório, revisão de 18/12/2023. Não é firmware do Hydra nem registro de uma carga nesta placa.'},
  tamarinInterface: {title:'stacksmashing · interfaces do Tamarin',url:'https://github.com/stacksmashing/tamarin-firmware/blob/5d4a559a6bd34781ab21a38bf5dc151e61749f37/README.md',scope:'generic',note:'Separa identificação, dados e alimentação na interface Lightning de pesquisa. A numeração do dock vem do esquema local.'},
  authentication: {title:'Apple · autenticação de acessórios',url:'https://support.apple.com/en-my/guide/security/sec70a4f377d/web',scope:'generic',note:'A Apple descreve certificado e desafio assinado. A página não atribui todo o processo ao Hydra nem especifica seus comandos IDBUS.'},
  i2c: {title:'NXP · especificação I2C UM10204',url:'https://www.nxp.com/docs/en/user-guide/UM10204.pdf#page=10',scope:'generic',note:'Formato genérico do barramento: endereço de 7 bits, leitura/escrita e ACK/NACK. O endereço do Hydra vem da página 41 do esquema local; não há lista de registradores deste CI nesta fonte.'},
  bc12: {title:'TI · BC1.2 e detecção por D+/D−',url:'https://www.ti.com/lit/an/slvae17/slvae17.pdf#page=2',scope:'generic',note:'SLVAE17A, seção 1: usa D+/D− para identificar capacidade da porta USB, distinguindo SDP, CDP e DCP. Explica o padrão; não demonstra os critérios de firmware usados pelo Hydra do iPhone 11.'},
  pdProtocol: {title:'USB-IF · USB-PD 3.0, sequência de negociação',url:'https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/138/USB_5F00_PD_5F00_R3_5F00_0-V1.1-20170112.pdf#page=295',scope:'generic',note:'Especificação USB-IF hospedada pela TI, revisão 3.0 v1.1, figura 8-5. Explica o mecanismo genérico; não documenta uma captura ou o firmware do iPhone 11.'},
  fastCharge: {title:'Apple · carga rápida do iPhone',url:'https://support.apple.com/en-us/102574',scope:'generic',note:'Confirma o conjunto USB-C para Lightning com fonte USB-PD compatível. Não publica o contrato de tensão nem os comandos internos deste circuito.'},
  iphone11: {title:'Apple · especificações do iPhone 11',url:'https://support.apple.com/en-us/111865',scope:'generic',note:'Contexto do produto: bateria e carga por cabo. Os trajetos internos desta explicação são confirmados pelo esquema local.'}
 };

 // These are manually chosen circuit views, not an automatic slideshow or a
 // claim that the phone always executes these operations in this order.
 const topicDefinitions = [
  {
   id:'dock-energy-presence',title:'Energia e presença',
   summary:'VBUS alimenta; a detecção do dock informa que há uma conexão.',
   mechanism:[
    'J8200 leva a alimentação a VBUS1 do Yangtze U3300. Separadamente, J8200.10 segue por R8210 até CON_DET_L do Hydra. Compare os terminais: a informação de conexão não percorre o mesmo caminho da energia.',
    'Alimentação, identificação e dados seguem caminhos distintos na interface Lightning. Encontrar VBUS ou detectar o dock, isoladamente, não confirma que a bateria esteja recebendo carga.'
   ],
   flowIds:['vbus-entry','dock-detect-connector','dock-detect-hydra'],
   referenceComponentName:'U3300',pages:[24,41,51],
   sourceRefs:['schematic','tamarinInterface']
  },
  {
   id:'lightning-identification',title:'ACC1/ACC2 · identificação do plug',
   summary:'ACC leva a interface ao dock; IDBUS/SDQ identifica o acessório e não é I2C.',
   mechanism:[
    'Os ramos ACC1 e ACC2 passam pelos filtros FL8211 e FL8213 até o dock. A identificação e a orientação do plug participam da configuração da interface. Exemplos históricos de IDBUS incluem a consulta 0x74 e a resposta 0x75; eles não representam uma leitura ao vivo desta placa.',
    'Autenticação MFi é uma etapa distinta, que usa certificado e desafio assinado. Uma resposta 0x75, isoladamente, não demonstra todo esse processo. ACC1/ACC2 identificam os ramos no mapa, sem atribuir uma equivalência fixa com ID0/ID1 em cada orientação.'
   ],
   flowIds:['hydra-acc1-device','hydra-acc1-dock','hydra-acc2-device','hydra-acc2-dock'],
   referenceComponentName:'U6300',pages:[41,51],
   protocol:[{title:'O diálogo IDBUS',text:'Em exemplos conhecidos de IDBUS, a duração dos pulsos distingue zeros e uns. BREAK delimita a consulta; tipo, dados e CRC-8 formam a mensagem. Depois vem a resposta do acessório, quando prevista. O mapa não captura esses pacotes nem determina a sequência exata deste Hydra.'}],
   sourceRefs:['schematic','nyansatan','tamarin','authentication']
  },
  {
   id:'usb-data-path',title:'DP/DN · USB e detecção da fonte',
   summary:'DP1/DN1 e DP2/DN2 também merecem atenção no reconhecimento da carga.',
   mechanism:[
    'DP1/C3 e DN1/C4 ligam Hydra a J8200.17/15; DP2/A3 e DN2/A4 chegam a J8200.11/13. USB0_DP/USB0_DN passam por L6300/L6301 até U1000.CR44/CP44. O mapa mantém cada par e cada lado dos filtros separados, sem desenhar uma ligação imaginária dentro do Hydra.',
    'D+/D− também participam da carga: BC1.2 usa essas linhas para reconhecer a capacidade de uma porta USB compatível. Esse mecanismo é distinto de IDBUS/SDQ em ACC e de USB-PD em CC. A política exata de detecção do Hydra não é simulada; nem toda fonte USB-A é compatível com BC1.2.'
   ],
   flowIds:['hydra-dp1-p','hydra-dp1-n','hydra-dp2-p','hydra-dp2-n','hydra-usb-ap-p','usb-filter-ap-p','hydra-usb-ap-n','usb-filter-ap-n'],
   referenceComponentName:'U6300',pages:[7,41,51],
   protocol:[{title:'D+/D− também ajudam a reconhecer a carga',text:'Em BC1.2, a detecção primária separa uma porta convencional SDP de uma porta de carga. A secundária, quando usada, distingue CDP (carga e dados) de DCP (carga sem dados). O mecanismo sinaliza capacidade da fonte por D+/D−; não negocia um contrato USB-PD e não comprova qual algoritmo Hydra executa nesta placa.'}],
   sourceRefs:['schematic','bc12','nyansatan','tamarinInterface']
  },
  {
   id:'hydra-system-control',title:'Hydra e o sistema',
   summary:'I2C1 controla Hydra; linhas próprias avisam conexão e atenção.',
   mechanism:[
    'O SMC em U1000 se comunica com U6300 por I2C1: SCL chega a G4 e SDA a G5. DOCK_ATTENTION e DOCK_CONNECT levam informações por outros terminais. O PMIC também participa, recebendo sinais do Hydra e fornecendo ACTIVE_READY.',
    'IDBUS pertence ao diálogo com o plug; I2C1 é a interface interna da placa. Embora ambos participem da comunicação com Hydra, cumprem funções diferentes. Nomes como BRICK_ID não revelam, sozinhos, o valor ou o evento comunicado.'
   ],
   flowIds:['hydra-i2c-clock','hydra-i2c-data','hydra-attention','hydra-dock-cpu','hydra-dock-pmic','hydra-active-ready','hydra-brick-id'],
   referenceComponentName:'U6300',pages:[13,22,41],
   protocol:[{title:'O diálogo I2C1',text:'Hydra usa o endereço I2C 0x1A em 7 bits, representado como 0011010X. Incluindo o bit R/W, 0x34 escreve e 0x35 lê. Após cada byte há ACK/NACK no nono clock; ACK mantém SDA baixo. Essa explicação mostra o formato do barramento, sem simular registradores ou uma resposta medida nesta placa.'}],
   sourceRefs:['schematic','nyansatan','i2c']
  },
  {
   id:'usb-power-delivery',title:'USB-C e Power Delivery',
   summary:'U6200/CCG2 é um participante separado, ligado ao I2C0 e ao Hydra.',
   mechanism:[
    'A carga rápida do iPhone 11 usa cabo USB-C para Lightning e fonte USB-PD compatível. U6200 participa dessa interface: conversa com o SMC por I2C0 e se liga a CC0 do Hydra por seu terminal CC1. Uma linha separada comunica interrupção ao sistema.',
    'PD, IDBUS e I2C são protocolos distintos. O trecho CC mostrado liga U6200 a U6300; ele não representa uma trilha contínua até a fonte remota. Tensão negociada, conteúdo das mensagens e temporização dependem da transação real e não são simulados.'
   ],
   flowIds:['pd-i2c-clock','pd-i2c-data','pd-hydra-cc','pd-attention'],
   referenceComponentName:'U6200',pages:[13,40,41],
   protocol:[{title:'O acordo USB-PD',text:'Em uma negociação bem-sucedida, a fonte anuncia Source_Capabilities; o consumidor escolhe com Request; a fonte confirma com Accept e envia PS_RDY quando a alimentação acordada está pronta. Este é o mecanismo genérico do padrão. O mapa confirma U6200 e sua conexão CC, não o contrato negociado pelo aparelho.'}],
   sourceRefs:['schematic','fastCharge','pdProtocol']
  },
  {
   id:'hydra-yangtze-control',title:'Do reconhecimento à carga',
   summary:'Hydra valida VBUS; Yangtze tem alimentação, controle e detecção próprios.',
   mechanism:[
    'U3300 fornece PP_VAR_USB_RVP ao Hydra. Na relação inversa, U6300.H3 envia VBUS1_VALID* a U3300.C3. O SMC controla Yangtze pelo I2C0, e VBUS1_DET segue por R3332 até USB_VBUS da CPU. Cada ligação cumpre uma função distinta.',
    'Exemplos históricos da comunicação do acessório incluem mensagens de identificação e energia, como 0x70/0x71. Esses exemplos não definem o algoritmo do Yangtze. CCG2 e Yangtze compartilham I2C0, mas são CIs diferentes, com funções e destinos próprios.'
   ],
   flowIds:['hydra-supply','hydra-valid','charger-i2c-clock','charger-i2c-data','vbus-detect-source','vbus-detect-cpu'],
   referenceComponentName:'U3300',pages:[7,13,24,41],
   sourceRefs:['schematic','tamarin']
  },
  {
   id:'battery-power-and-sense',title:'Bateria, sistema e medição',
   summary:'As bobinas conduzem energia; os ramos de sense levam referências ao PMIC.',
   mechanism:[
    'L3301 e L3302 fazem parte da conversão do Yangtze e alcançam o nó BAT. R3303 relaciona esse nó a PP_VDD_MAIN. R3360 e R3361 levam referências de seus lados às entradas VBAT/IBAT do PMIC. São ramos de medição, diferentes do caminho principal de potência.',
    'INT* avisa o PMIC; SYSTEM_ALIVE informa estado ao carregador. A velocidade real de carga varia com condições como a temperatura. O mapa explica as conexões, sem medir corrente, definir limiares ou associar uma interrupção a uma falha específica.'
   ],
   flowIds:['switch-1','switch-2','converter-output-1','converter-output-2','main-supply','battery-terminal','sense-voltage-source','sense-voltage-pmic','sense-current-source','sense-current-pmic','charger-interrupt','pmic-system-alive'],
   referenceComponentName:'U2700',pages:[22,24,43],
   sourceRefs:['schematic','fastCharge']
  },
  {
   id:'battery-communication',title:'A bateria também conversa',
   summary:'J7000.1 conduz energia; J7000.2/3 participam da comunicação I2C2.',
   mechanism:[
    'I2C2 do SMC atravessa R7001/R7002 e chega aos contatos de relógio e dados da bateria. Compare com o positivo J7000.1: alimentar o aparelho e trocar informações com a bateria são funções diferentes, mesmo que compartilhem o mesmo conector.',
    'A ligação permite ao SMC se comunicar com o circuito da bateria. Os registradores, as mensagens e a autenticação não são simulados. Como não há uma direção única confirmada para todo esse recorte de I2C2, seus caminhos ficam disponíveis sem seta unilateral.'
   ],
   flowIds:['battery-i2c-clock-source','battery-i2c-clock-connector','battery-i2c-data-source','battery-i2c-data-connector'],
   referenceComponentName:'U1000',pages:[13,43],
   sourceRefs:['schematic','iphone11']
  }
 ];

 function endpointName(endpoint) {
  return String(endpoint?.componentName || endpoint?.component || '').trim();
 }

 // Return fresh data. Filtering never resolves a missing relation by nearest
 // geometry, by a similar net name, or by another consumer on the same net.
 function getTopics(study) {
  if (!study || !Array.isArray(study.flows) || study.id !== 'charging' || study.modelId !== 'iphone-11') {
   return {sources:[],topics:[]};
  }
  const flowMap = new Map();
  const duplicateIds = new Set();
  for (const flow of study.flows) {
   if (!flow || typeof flow.id !== 'string') continue;
   if (flowMap.has(flow.id)) duplicateIds.add(flow.id);
   else flowMap.set(flow.id,flow);
  }
  for (const id of duplicateIds) flowMap.delete(id);
  const sourcePdf = typeof study.sourcePdf === 'string' && study.sourcePdf && !/^(?:[a-z][\w+.-]*:|\/\/)/i.test(study.sourcePdf) ? study.sourcePdf.split('#')[0] : PDF;
  const sources = Object.entries(sourceDefinitions).map(([id,source]) => ({id,...source,url:id==='schematic'?sourcePdf:source.url}));
  const sourceMap = new Map(sources.map(source => [source.id,source]));
  const topics = topicDefinitions.map(definition => {
   const flowIds = definition.flowIds.filter(id => flowMap.has(id));
   const componentNames = [...new Set(flowIds.flatMap(id => {
    const flow = flowMap.get(id);
    return [endpointName(flow.from),endpointName(flow.to)].filter(Boolean);
   }))];
   const reference = (study.componentProfiles || []).find(component => [component.name,component.sourceName].includes(definition.referenceComponentName));
   const missingFlowIds = definition.flowIds.filter(id => !flowMap.has(id));
   const available = flowIds.length > 0 && !missingFlowIds.length && !!reference && flowIds.some(id => {
    const flow=flowMap.get(id);return [flow.from?.componentId,flow.to?.componentId].includes(reference.id);
   });
   const pages = [...new Set([...definition.pages,...flowIds.flatMap(id=>{const evidence=flowMap.get(id).evidence;return [evidence?.page,...(evidence?.pages||[])];})].filter(page=>Number.isInteger(page)&&page>0))].sort((a,b)=>a-b);
   const sourceRefs = definition.sourceRefs.map(id => {
    const source = {...sourceMap.get(id)};
    if (id === 'schematic') {
     source.pages = pages.slice();
     source.url += '#page=' + pages[0];
    }
    return source;
   });
   return {...definition,mechanism:definition.mechanism.slice(),protocol:(definition.protocol||[]).map(item=>({...item})),flowIds,componentNames,pages,sourceRefs,available,referenceComponentId:reference?.id??null,referenceDisplayName:reference?.name||definition.referenceComponentName,missingFlowIds};
  });
  return {sources,topics};
 }

 return Object.freeze({revision:86,getTopics});
});
