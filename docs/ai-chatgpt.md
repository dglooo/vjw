# ChatGPT → VeeJay Wizard: шейдеры из чата

VeeJay Wizard — визуализатор музыки в браузере. Его редактор шейдеров **G** принимает код по сети: ИИ пишет шейдер
(GLSL), отправляет его в редактор, получает ошибки компиляции по строкам и исправляет их, а вы смотрите картинку под
музыку и говорите, что поменять. Связь идёт через ретранслятор на сервере сайта, и замок у него один: токен.
Правила для шейдеров (их читает ИИ): https://shanghai-cn-k8s.mooo.com/vjw001/ai/shader-guide.md

> **Важно (справка OpenAI на 21.11.2026):** на личных аккаунтах (Free, Go, Plus, Pro) новый GPT создать нельзя, а все
> Custom GPT отключат **11.12.2026**. Путь § 2 работает, только если у вас уже есть свой GPT (его можно редактировать)
> или ваше рабочее пространство (Business, Enterprise) ещё разрешает создавать GPT. Иначе § 6: Codex (он входит во все
> тарифы ChatGPT), Claude Code и другие агенты.

## 1. Что нужно

- От владельца сайта: адрес `https://shanghai-cn-k8s.mooo.com/vjw001` и токен `<TOKEN>`. Токен никому не пересылайте.
- Откройте сайт → **Start** → **G** → в строке **Remote AI** вставьте токен → **Connect** (точка станет зелёной).
  Вкладка должна оставаться на экране. Работает один редактор за раз: новая вкладка забирает связь у старой.

## 2. GPT с Action

1. chatgpt.com/gpts → свой GPT → **Edit** (или **Create**, если вам это доступно) → вкладка **Configure**.
2. **Instructions**: вставьте текст из § 3.
3. Внизу **Actions** → **Create new action**:
   - **Authentication** → **API Key**, **Auth Type**: **Bearer**, ключ: токен → **Save**.
   - **Schema**: вставьте JSON из § 4. Появятся 4 действия: `getGuide`, `getState`, `pushShader`, `exportShader`.
   - **Privacy policy**: нужна, только если вы делитесь GPT по ссылке или в Store (тогда подойдёт любая ваша
     страница, например адрес сайта). Лучше оставить GPT «Only me»: кто пользуется GPT, тот рисует в редакторе.
4. **Preview**: «нарисуй неоновые кольца, которые раздувает бас». На вопрос о вызове нажмите **Always allow**
   (экспорт спрашивает каждый раз). Затем **Update**.
5. ChatGPT не видит картинку (Action принимает только текст): говорите ему, что на экране.

## 3. Instructions (вставить как есть)

```text
You write Shadertoy-style GLSL for VeeJay Wizard. Before writing, call getGuide once and follow it.
Use pushShader with still:false; read errors by line and fix; call getState before changing the user's code;
exportShader when the user likes it. You get no picture back: ask the user what they see.
Never map sound straight to brightness; no strobes.
```

## 4. OpenAPI schema (вставить в Schema)

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "VeeJay Wizard shader editor",
    "description": "Live-code the G shader editor open in the site owner's browser: push GLSL, read the compile errors, export.",
    "version": "1.0.0"
  },
  "servers": [{ "url": "https://shanghai-cn-k8s.mooo.com/vjw001" }],
  "paths": {
    "/__ai/guide": {
      "get": {
        "operationId": "getGuide",
        "summary": "The shader contract and the rules (markdown). Read it once before writing.",
        "responses": {
          "200": { "description": "The guide", "content": { "text/markdown": { "schema": { "type": "string" } } } }
        }
      }
    },
    "/__ai/state": {
      "get": {
        "operationId": "getState",
        "summary": "The code in the editor now, its last errors, and who wrote it last (AI or user).",
        "responses": {
          "200": { "description": "The editor's state", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Answer" } } } }
        }
      }
    },
    "/__ai/shader": {
      "post": {
        "operationId": "pushShader",
        "summary": "Put GLSL into the editor and compile it. Answers status Playing, or the errors by line.",
        "x-openai-isConsequential": false,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["code", "still"],
                "properties": {
                  "code": { "type": "string", "description": "The whole shader: Shadertoy-style GLSL ES 3.00 with mainImage, 1 to 65536 characters." },
                  "name": { "type": "string", "description": "A title for an unsaved draft." },
                  "still": { "type": "boolean", "description": "Always false: the answer then carries no PNG still (an Action cannot take one)." }
                }
              }
            }
          }
        },
        "responses": {
          "200": { "description": "Playing, or the errors", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Answer" } } } }
        }
      }
    },
    "/__ai/export": {
      "post": {
        "operationId": "exportShader",
        "summary": "Download the editor's shader as <name>.glsl in the user's browser.",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["name"],
                "properties": { "name": { "type": "string", "description": "The file name: letters, digits, spaces, _ and -." } }
              }
            }
          }
        },
        "responses": {
          "200": { "description": "The file name, or why not", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Answer" } } } }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "Answer": {
        "type": "object",
        "properties": {
          "ok": { "type": "boolean" },
          "status": { "type": "string" },
          "error": { "type": "string" },
          "errors": { "type": "array", "items": { "type": "object", "properties": { "line": { "type": "integer" }, "msg": { "type": "string" } } } },
          "code": { "type": "string" },
          "author": { "type": "string" },
          "file": { "type": "string" }
        }
      }
    },
    "securitySchemes": { "bearerAuth": { "type": "http", "scheme": "bearer" } }
  },
  "security": [{ "bearerAuth": [] }]
}
```

## 5. Если не работает

- `401`, «a wrong or missing token»: неверный токен в Authentication (API Key, Bearer, без пробелов).
- «no G editor open» или «did not answer in 20 s»: откройте сайт → Start → G → Remote AI → Connect; вкладка на экране.
- `line 7: …`: ошибка GLSL в строке 7. ChatGPT правит и шлёт снова (скажите «исправь»).
- «another tab took the connection»: работает один редактор, нажмите Connect в той вкладке, где смотрите.

## 6. Другие ИИ

- Claude Code: скилл `vjw-shader` (папку даёт владелец сайта) → `~/.claude/skills/`, затем `VJW_URL` и `VJW_AI_TOKEN`.
- Codex (входит во все тарифы ChatGPT), Gemini CLI, любой агент с терминалом: дайте ему ссылку на правила (выше), адрес
  и токен. Вызовы те же, что в схеме § 4, с заголовком `Authorization: Bearer <TOKEN>`, или скрипт скилла
  `node vjw-shader/scripts/vjw.mjs push my.glsl` (Node ≥ 18): без `--no-still` он сохраняет кадр, и агент его видит.
