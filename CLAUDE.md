# Prometheus — CLAUDE.md

Guía de arquitectura, decisiones técnicas y convenciones para el desarrollo de **Prometheus**: una plataforma de chat con IA que evolucionará hacia un **Sistema Multi-Agente (MAS)**.

---

## Visión del Proyecto

**Prometheus** es una plataforma conversacional de IA construida sobre Next.js 16 + Vercel AI SDK v6. El objetivo final es convertirla en un **MAS (Multi-Agent System)**: una red de agentes especializados que colaboran, se delegan tareas entre sí y producen resultados que ningún agente único podría lograr solo.

### Hoja de ruta macro

1. **Fase 0 (actual):** Chatbot base — streaming, artefactos, multi-modelo.
2. **Fase 1 (en curso):** Migrar backend a **Supabase** (DB + Auth + Storage + Realtime).
3. **Fase 2:** Implementar arquitectura MAS — agentes especializados, orquestador, memoria compartida.
4. **Fase 3:** Interfaz de monitoreo de agentes, trazabilidad de tareas, colaboración en tiempo real.

---

## Stack Tecnológico

### Frontend
- **Next.js 16.2** — App Router, React Server Components, Server Actions
- **React 19** — con React Compiler activado (memoización automática)
- **TypeScript 5.6** — strict mode
- **Tailwind CSS 4** + **shadcn/ui** + **Radix UI** — sistema de diseño
- **Vercel AI SDK v6** (`ai`, `@ai-sdk/react`) — streaming, tool calling, UI message streams

### Backend / Infraestructura
- **Supabase** ← **BaaS principal** (ver sección dedicada abajo)
- **Drizzle ORM 0.34** — ORM type-safe sobre el Postgres de Supabase
- **Redis** (Upstash) — rate limiting por IP/usuario
- **Vercel Blob** — almacenamiento de archivos subidos por usuarios
- **Vercel AI Gateway** — proxy multi-proveedor para los LLMs

### Calidad y Tooling
- **Biome 2** + **Ultracite** — linting y formateo (reemplaza ESLint/Prettier)
- **Playwright** — tests E2E
- **OpenTelemetry** + **Vercel OTEL** — trazabilidad y observabilidad
- **Vercel BotID** — protección anti-bots

---

## Supabase como Backend Principal

### Decisión

**Supabase reemplaza** el stack original (Neon PostgreSQL + NextAuth.js + Drizzle migrations). Supabase provee de forma unificada:

| Servicio Supabase | Reemplaza |
|---|---|
| **Supabase Auth** | NextAuth.js v5 (credentials + guest) |
| **Supabase Postgres** | Neon (serverless Postgres) |
| **Supabase Storage** | Vercel Blob (para archivos de usuario) |
| **Supabase Realtime** | Websockets manuales / resumable-stream |
| **Supabase Edge Functions** | Lógica de agentes ligera |

### Variables de entorno requeridas (Supabase)

```bash
# Supabase — obligatorias
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # solo server-side

# Vercel AI Gateway
AI_GATEWAY_API_KEY=<key>                        # para despliegues fuera de Vercel

# Redis (rate limiting)
REDIS_URL=<upstash-redis-url>

# Auth (compatibilidad NextAuth durante migración)
AUTH_SECRET=<32-char-random>
```

### Patrones de uso de Supabase en el código

- **Auth:** usar `@supabase/ssr` para Server Components y Route Handlers. Nunca usar `supabase-js` directamente en Client Components para operaciones autenticadas.
- **DB queries:** mantener Drizzle ORM sobre el connection string de Supabase Postgres (`POSTGRES_URL`). Esto preserva type-safety y migraciones versionadas.
- **Realtime:** usar `supabase.channel()` para sincronización de estado de agentes en tiempo real.
- **RLS (Row Level Security):** todas las tablas deben tener políticas RLS activas. Nunca exponer `service_role_key` al cliente.

---

## Arquitectura MAS (Multi-Agent System)

### Concepto

Un MAS en Prometheus consiste en **agentes autónomos especializados** que:
- Reciben tareas del usuario o de un **Orquestador**
- Pueden delegar sub-tareas a otros agentes
- Comparten una **memoria persistente** (Supabase DB)
- Reportan progreso en tiempo real vía **Supabase Realtime**
- Producen **Artefactos** (código, documentos, hojas de cálculo, imágenes)

### Topología de Agentes (diseño objetivo)

```
Usuario
  │
  ▼
┌─────────────────────────────┐
│      Agente Orquestador     │  ← planifica, delega, sintetiza
│   (Kimi K2 / GPT OSS 120B)  │
└──────────┬──────────────────┘
           │ delega tareas
    ┌──────┼──────────┬─────────────┐
    ▼      ▼          ▼             ▼
┌──────┐ ┌──────┐ ┌────────┐ ┌──────────┐
│Coder │ │Writer│ │Analyst │ │Researcher│
│Agent │ │Agent │ │ Agent  │ │  Agent   │
└──────┘ └──────┘ └────────┘ └──────────┘
    │        │         │            │
    └────────┴─────────┴────────────┘
                    │
              Supabase DB
           (memoria compartida)
```

### Tablas de base de datos para MAS (a añadir)

Además del schema existente, el MAS requiere:

```sql
-- Sesión de trabajo multi-agente
agent_sessions (
  id uuid PK,
  chat_id uuid FK → Chat,
  user_id uuid FK → User,
  status text,        -- 'running' | 'paused' | 'completed' | 'failed'
  orchestrator_model text,
  created_at timestamp,
  updated_at timestamp
)

-- Agentes individuales dentro de una sesión
agents (
  id uuid PK,
  session_id uuid FK → agent_sessions,
  name text,          -- 'Coder', 'Writer', 'Analyst', etc.
  role text,          -- descripción del rol/especialidad
  model_id text,      -- modelo LLM asignado
  status text,        -- 'idle' | 'working' | 'done' | 'error'
  created_at timestamp
)

-- Tareas asignadas a agentes
agent_tasks (
  id uuid PK,
  session_id uuid FK → agent_sessions,
  agent_id uuid FK → agents,
  parent_task_id uuid FK → agent_tasks,  -- para sub-tareas
  description text,
  result text,
  status text,        -- 'pending' | 'in_progress' | 'done' | 'failed'
  created_at timestamp,
  completed_at timestamp
)

-- Memoria compartida entre agentes (vector store compatible)
agent_memory (
  id uuid PK,
  session_id uuid FK → agent_sessions,
  agent_id uuid FK → agents,
  key text,
  value jsonb,
  embedding vector(1536),  -- pgvector para búsqueda semántica
  created_at timestamp
)
```

### Modelo de LLMs por rol de agente

| Rol | Modelo recomendado | Razón |
|---|---|---|
| Orquestador | `moonshotai/kimi-k2.5` | Razonamiento largo, planificación |
| Coder | `mistral/codestral` | Especializado en código |
| Writer | `moonshotai/kimi-k2-0905` | Rápido, contexto largo |
| Analyst | `openai/gpt-oss-120b` | Razonamiento cuantitativo |
| Researcher | `deepseek/deepseek-v3.2` | Síntesis de información |
| Titles/Aux | `mistral/mistral-small` | Tareas ligeras, rápido |

---

## Schema de Base de Datos (actual)

Tablas existentes gestionadas con **Drizzle ORM**:

| Tabla | Descripción |
|---|---|
| `User` | Usuarios (regular + guest/anónimo) |
| `Chat` | Conversaciones con visibilidad public/private |
| `Message_v2` | Mensajes con `parts` y `attachments` en JSON |
| `Vote_v2` | Feedback upvote/downvote por mensaje |
| `Document` | Artefactos versionados (PK compuesta: id + createdAt) |
| `Suggestion` | Sugerencias IA sobre documentos |
| `Stream` | Sesiones de streaming resumible |

---

## Modelos de IA disponibles

Todos los modelos se acceden vía **Vercel AI Gateway** con fallback routing automático:

| Modelo | ID | Proveedor Fallback |
|---|---|---|
| Kimi K2 0905 *(default)* | `moonshotai/kimi-k2-0905` | baseten → fireworks |
| Kimi K2.5 | `moonshotai/kimi-k2.5` | fireworks → bedrock |
| DeepSeek V3.2 | `deepseek/deepseek-v3.2` | bedrock → deepinfra |
| Codestral | `mistral/codestral` | mistral |
| Mistral Small | `mistral/mistral-small` | mistral |
| GPT OSS 20B | `openai/gpt-oss-20b` | groq → bedrock |
| GPT OSS 120B | `openai/gpt-oss-120b` | fireworks → bedrock |
| Grok 4.1 Fast | `xai/grok-4.1-fast-non-reasoning` | xai |

---

## Sistema de Artefactos

Los artefactos son documentos generados/editados por el LLM en tiempo real. Tipos soportados:

| Tipo | Handler | Descripción |
|---|---|---|
| `code` | `artifacts/code/server.ts` | Editor CodeMirror; Python ejecutable en browser (Pyodide) |
| `text` | `artifacts/text/server.ts` | Documento enriquecido con vista diff (ProseMirror) |
| `sheet` | `artifacts/sheet/server.ts` | Hoja de cálculo CSV (react-data-grid) |
| `image` | — | Imágenes generadas por IA |

**Regla:** el LLM solo puede llamar **una herramienta por respuesta**. Después de `createDocument`, `editDocument` o `updateDocument` no puede encadenar más herramientas.

---

## Herramientas del LLM (AI Tools)

| Herramienta | Archivo | Función |
|---|---|---|
| `createDocument` | `lib/ai/tools/create-document.ts` | Crear nuevo artefacto |
| `editDocument` | `lib/ai/tools/edit-document.ts` | Editar con find-replace preciso |
| `updateDocument` | `lib/ai/tools/update-document.ts` | Reescritura completa del artefacto |
| `getWeather` | `lib/ai/tools/get-weather.ts` | Clima en tiempo real |
| `requestSuggestions` | `lib/ai/tools/request-suggestions.ts` | Sugerencias IA sobre documento |

Al implementar herramientas para agentes MAS, seguir el mismo patrón de archivo por herramienta en `lib/ai/tools/`.

---

## Rutas API

| Ruta | Método | Función |
|---|---|---|
| `/api/chat` | POST | Crear mensaje, iniciar streaming LLM |
| `/api/chat/[id]/stream` | GET/POST | Stream resumible de respuesta |
| `/api/document` | GET/POST/PUT | CRUD de artefactos |
| `/api/history` | GET | Historial de chats del usuario |
| `/api/messages` | GET/POST | Mensajes de un chat |
| `/api/models` | GET | Lista de modelos con capacidades |
| `/api/vote` | POST | Upvote/downvote de mensaje |
| `/api/suggestions` | POST | Generar sugerencias IA |
| `/api/files/upload` | POST | Subir archivo a Blob/Storage |
| `/api/auth/[...nextauth]` | * | NextAuth.js (migrar a Supabase Auth) |
| `/api/auth/guest` | POST | Crear sesión de invitado |

---

## Comandos de Desarrollo

```bash
# Iniciar servidor de desarrollo (Turbopack)
pnpm dev

# Build de producción (ejecuta migraciones DB primero)
pnpm build

# Gestión de base de datos (Drizzle)
pnpm db:generate    # generar nueva migración desde cambios en schema.ts
pnpm db:migrate     # aplicar migraciones pendientes
pnpm db:studio      # abrir Drizzle Studio UI

# Calidad de código
pnpm check          # lint + type-check
pnpm fix            # autofix de errores de lint/formato

# Tests E2E
pnpm test           # Playwright
```

---

## Convenciones de Código

- **Rutas API:** `app/(chat)/api/<recurso>/route.ts` — un archivo por recurso
- **Server Actions:** `app/(chat)/actions.ts` — acciones de servidor del área de chat
- **Queries DB:** siempre en `lib/db/queries.ts` — nunca inline en componentes/rutas
- **Hooks:** `hooks/use-<nombre>.ts` — un hook por archivo
- **Componentes:** `components/chat/` para chat, `components/ai-elements/` para elementos de IA, `components/ui/` para shadcn
- **Linting:** Biome con presets de Ultracite. No usar ESLint ni Prettier.
- **Imports:** usar alias `@/` como raíz del proyecto

### Seguridad
- Todo acceso a DB debe ir por `lib/db/queries.ts` con `server-only`
- Las `SUPABASE_SERVICE_ROLE_KEY` nunca deben llegar al cliente
- Rate limiting activo en `/api/chat` — 10 mensajes/hora por usuario (guest y regular)
- BotID middleware activo en todas las rutas públicas

---

## Estructura de Directorios

```
prometheus/
├── app/
│   ├── (auth)/              # Login, registro, guest
│   └── (chat)/              # Chat UI + todas las API routes
├── lib/
│   ├── ai/                  # Modelos, prompts, tools, entitlements
│   ├── db/                  # Schema Drizzle, queries, migraciones
│   └── ...                  # utils, types, ratelimit
├── components/
│   ├── chat/                # Componentes del chat
│   ├── ai-elements/         # Elementos de IA (mensajes, tools, reasoning)
│   └── ui/                  # shadcn/ui
├── artifacts/               # Handlers de artefactos (code/text/sheet)
├── hooks/                   # Custom React hooks
└── tests/                   # Tests E2E Playwright
```

---

## Referencias

- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Drizzle ORM](https://orm.drizzle.team)
- [Next.js App Router](https://nextjs.org/docs/app)
- [shadcn/ui](https://ui.shadcn.com)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
