---
repo: architecture
path: docs/architecture/aw-app-mobile.md
source: generated
edited: false
checksum: sha256:90e6db277675bbfc4749a572f5dca0217f292dd75183a88851cdb99b842c79c4
---
# AW Mobile

- **repo**: aw-app-mobile
- **layer**: app
- **technologies**: python, react
- **health** (derived): planned

Your Apple Health history and where you've been, in a window and in your agents' hands. Nine years of heart rate, sleep, steps and workouts charted by day, week or month with a drill-down to individual readings — plus 13 MCP tools so an agent can answer "where was I on Tuesday?" or "how did I sleep?", save a place by name, and log a meal or a symptom. Also the workspace half of aw-mobile: installing it creates the agents the iPhone, Apple Watch and Meta glasses talk to.

## Connections
- `http` → **aw-workspace** — routes mounted at /api/apps/mobile
- `other` → **aw-app-agents-platform-runners** — Provides the contributes
- `stdio-mcp` → **mcp-gateway** — MCP surface aggregated by the gateway

## MCP tools
- `delete_location_annotation`
- `get_devices`
- `get_health_samples`
- `get_location`
- `get_location_history`
- `get_location_stops`
- `list_health_log`
- `list_location_annotations`
- `log_health_event`
- `save_location_annotation`
- `search_location_annotations`
- `sync_health_now`
- `update_location_annotation`

## Requirements
### O bundle de config é declarado por referência, e é isso que conserta o token sozinho
- Given este repo é público e o bundle de config vivo carrega URL e bearer token do gateway
- When o bundle é declarado apontando o servidor só pelo nome (repos/aw-app-mobile/tests/test_manifest.py::test_the_config_bundle_is_declared_by_reference:96, exigindo mcp_servers == ["aw-gateway"])
- Then a entrada existe no manifesto sem credencial nenhuma e o provisionador resolve URL e token do .mcp.json do próprio workspace na ativação — declarar é o que torna o conserto automático, porque o provisionador só reafirma credenciais para entradas por referência. Um config NÃO declarado é uma linha que ninguém é dono, e foi assim que esta aqui acabou apontando para 127.0.0.1:9200, o container do próprio agente e não o gateway, com token rotacionado, deixando todo agente sob ela com zero tools MCP
- intended_status: `not_implemented` · derived health: `not_implemented`
- tests: `repos/aw-app-mobile/tests/test_manifest.py` (passing)

### Nada que vire configuração carrega credencial, mas a prosa que a explica é isenta
- Given a descrição do próprio config explica por que o token NÃO está ali, e uma varredura literal marcaria justamente essa explicação
- When a varredura roda sobre o payload sem os campos description e name (repos/aw-app-mobile/tests/test_manifest.py::test_the_config_bundle_carries_no_credential:110)
- Then não aparecem "authorization", "bearer", "token", "9200" nem "127.0.0.1" no que vira configuração, e mcp_config e headers estão ausentes — incluir o endereço errado histórico na lista de proibidos é o detalhe que impede a regressão específica de voltar, e isentar a prosa é o que impede o teste de virar aquele que se desliga por dar falso positivo
- intended_status: `not_implemented` · derived health: `not_implemented`
- tests: `repos/aw-app-mobile/tests/test_manifest.py` (passing)

### Cada uma das três variantes nomeia um modelo de runner real, e são três modelos diferentes
- Given o app entrega watch-sonnet, watch-opus e watch-fable como escolhas de custo/profundidade para o mesmo canal
- When os model_slug são conferidos contra a lista de modelos de runner conhecidos e entre si (repos/aw-app-mobile/tests/test_manifest.py::test_every_agent_names_a_real_runner_model:67 e test_the_three_variants_use_three_different_models:76)
- Then todo slug existe como modelo de runner e os três são distintos — apontar para um modelo inexistente não impede nada na criação: a plataforma cria o agente do mesmo jeito e a falha só aparece no despacho, longe da causa. E três agentes no mesmo modelo dariam ao usuário uma escolha que não é escolha, com três nomes para a mesma coisa
- intended_status: `not_implemented` · derived health: `not_implemented`
- tests: `repos/aw-app-mobile/tests/test_manifest.py` (passing)

### A regra de não usar markdown é repetida no prompt como rede de segurança
- Given a resposta é lida num relógio de 40mm ou falada em voz alta, onde markdown vira ruído literal, e a regra já vive no skill
- When o prompt de cada agente é conferido (repos/aw-app-mobile/tests/test_manifest.py::test_prompt_repeats_the_no_markdown_rule_as_a_safety_net:150) junto com o carregamento do skill por todos (test_every_agent_carries_the_watch_skill:128)
- Then os três agentes carregam o skill do canal E repetem a regra no próprio prompt — a duplicação é deliberada, porque o skill pode falhar em carregar e nesse caso o agente responde sem contrato nenhum, o que já aconteceu nesta casa. Repetir a regra que estraga a saída mais visivelmente é barato e degrada bem: pior caso, foi redundante
- intended_status: `not_implemented` · derived health: `not_implemented`
- tests: `repos/aw-app-mobile/tests/test_manifest.py` (passing)

### A janela e o bundle de frontend são declarados juntos, e o bundle existe mesmo
- Given uma janela declarada sem o bundle correspondente desenha moldura e corpo vazio, que se lê como bug do app e não como declaração incompleta
- When janela, bundle e capacidades são conferidos como um conjunto (repos/aw-app-mobile/tests/test_manifest.py::test_window_and_bundle_are_declared_together:56, test_the_declared_bundle_actually_exists:67 e test_declares_every_capability_the_window_needs:44)
- Then os dois são declarados em conjunto, o arquivo do bundle existe em disco e toda capacidade que a janela precisa está pedida no manifesto — uma capacidade negada remove corpo, linha de navegação e ações do título, deixando a moldura desenhada, que é exatamente o sintoma que manda alguém depurar o app errado por uma tarde inteira
- intended_status: `not_implemented` · derived health: `not_implemented`
- tests: `repos/aw-app-mobile/tests/test_manifest.py` (passing)
