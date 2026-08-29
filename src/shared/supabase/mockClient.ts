// ============================================================================
// MOCK Supabase client — used ONLY when mock mode is active (see mockMode.ts).
//
// Purpose: let the entire UI be tested in the browser without any Supabase
// project. All data lives in localStorage under a single key and is cleared
// on sign-out data reset. Nothing here makes a network request.
//
// SECURITY NOTES (this is a TEST DOUBLE, never shipped as the real path):
//   * passwords are stored as a SHA-256 digest, never plaintext
//   * the plaintext provider key submitted through the mock Edge API is held
//     in memory only for the duration of the request and is NEVER persisted
//   * secret key records never cross the `from()` table mapper — the browser
//     query surface stays limited to the same tables as production
// ============================================================================

import type {
  ConversationDbRow,
  MessageDbRow,
  ProfileRow,
  ProviderConnectionRow,
  UsageEventRow,
  UserSettingsRow,
} from "./types";

// --- storage -----------------------------------------------------------------

const STORAGE_KEY = "keyport.mock.v1";
const DEMO_USER_ID = "10000000-0000-4000-8000-000000000001";
const DEMO_EMAIL = "demo@keyport.test";
const DEMO_PASSWORD = "demo1234";
const DEMO_FULL_NAME = "Demo User";

export type MockKeyStatus = "active" | "invalid" | "disabled";

export interface MockApiKeyRecord {
  status: MockKeyStatus;
  createdAt: string;
  lastVerifiedAt: string | null;
  lastUsedAt: string | null;
}

export interface MockProviderEntry {
  connection: ProviderConnectionRow;
  key: MockApiKeyRecord;
}

interface MockUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string | null;
  createdAt: string;
}

interface MockSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
}

export interface MockDb {
  user: MockUser | null;
  session: MockSession | null;
  conversations: ConversationDbRow[];
  messages: MessageDbRow[];
  profiles: ProfileRow[];
  userSettings: UserSettingsRow[];
  usageEvents: UsageEventRow[];
  providers: MockProviderEntry[];
}

let dbCache: MockDb | null = null;

export function persistMockDb(db: MockDb): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* storage full/unavailable — the in-memory copy still works */
  }
}

export function clearMockDb(): void {
  dbCache = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function iso(d: Date): string {
  return d.toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`keyport-mock:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- seed data ----------------------------------------------------------------

function seedDb(): MockDb {
  const now = Date.now();
  const minutesAgo = (m: number) => iso(new Date(now - m * 60_000));

  const conv1: ConversationDbRow = {
    id: "20000000-0000-4000-8000-000000000001",
    user_id: DEMO_USER_ID,
    title: "Welcome to Keyport",
    provider_id: "openai",
    model_id: "gpt-4o-mini",
    system_prompt: null,
    pinned: false,
    archived: false,
    created_at: minutesAgo(120),
    updated_at: minutesAgo(2),
  };

  const conv2: ConversationDbRow = {
    id: "20000000-0000-4000-8000-000000000002",
    user_id: DEMO_USER_ID,
    title: "Model comparison notes",
    provider_id: "openai",
    model_id: "gpt-4o-mini",
    system_prompt: null,
    pinned: false,
    archived: false,
    created_at: minutesAgo(60 * 26),
    updated_at: minutesAgo(60),
  };

  const messages: MessageDbRow[] = [
    {
      id: "40000000-0000-4000-8000-000000000011",
      seq: 1,
      conversation_id: conv1.id,
      user_id: DEMO_USER_ID,
      role: "user",
      content: "Hi! How does the encrypted key storage work here?",
      provider_id: null,
      model_id: null,
      status: "complete",
      error: null,
      input_tokens: null,
      output_tokens: null,
      metadata: {},
      created_at: minutesAgo(118),
      updated_at: minutesAgo(118),
    },
    {
      id: "40000000-0000-4000-8000-000000000012",
      seq: 2,
      conversation_id: conv1.id,
      user_id: DEMO_USER_ID,
      role: "assistant",
      content:
        "Keyport keeps your provider keys encrypted at rest. Every API key is wrapped with a per-user data key, and that data key is itself wrapped with a master key that lives only in your Supabase project's secrets. The browser never sees the master key — all decryption happens inside the chat Edge Function, in server memory only.",
      provider_id: "openai",
      model_id: "gpt-4o-mini",
      status: "complete",
      error: null,
      input_tokens: 42,
      output_tokens: 61,
      metadata: {},
      created_at: minutesAgo(117),
      updated_at: minutesAgo(117),
    },
    {
      id: "40000000-0000-4000-8000-000000000013",
      seq: 3,
      conversation_id: conv1.id,
      user_id: DEMO_USER_ID,
      role: "user",
      content: "Can I bring my own OpenAI key?",
      provider_id: null,
      model_id: null,
      status: "complete",
      error: null,
      input_tokens: null,
      output_tokens: null,
      metadata: {},
      created_at: minutesAgo(60),
      updated_at: minutesAgo(60),
    },
    {
      id: "40000000-0000-4000-8000-000000000014",
      seq: 4,
      conversation_id: conv1.id,
      user_id: DEMO_USER_ID,
      role: "assistant",
      content:
        "Absolutely. This is a bring-your-own-key app by design. Open Settings → Providers, pick OpenAI, paste your key, and it is tested against the real OpenAI API before it is stored. From then on, every chat request uses your key exclusively — billing stays on your account, and nothing is shared.",
      provider_id: "openai",
      model_id: "gpt-4o-mini",
      status: "complete",
      error: null,
      input_tokens: 21,
      output_tokens: 64,
      metadata: {},
      created_at: minutesAgo(59),
      updated_at: minutesAgo(59),
    },
    {
      id: "40000000-0000-4000-8000-000000000015",
      seq: 5,
      conversation_id: conv1.id,
      user_id: DEMO_USER_ID,
      role: "user",
      content: "Show me a streaming response.",
      provider_id: null,
      model_id: null,
      status: "complete",
      error: null,
      input_tokens: null,
      output_tokens: null,
      metadata: {},
      created_at: minutesAgo(5),
      updated_at: minutesAgo(5),
    },
    {
      id: "40000000-0000-4000-8000-000000000016",
      seq: 6,
      conversation_id: conv1.id,
      user_id: DEMO_USER_ID,
      role: "assistant",
      content:
        "Here is one. Notice how the text appears token by token — that is the same Server-Sent Events pipeline used in production, with live deltas, usage accounting, and a done event when the response finalizes. Type a message below and watch it stream.",
      provider_id: "openai",
      model_id: "gpt-4o-mini",
      status: "complete",
      error: null,
      input_tokens: 17,
      output_tokens: 48,
      metadata: {},
      created_at: minutesAgo(4),
      updated_at: minutesAgo(2),
    },
    {
      id: "40000000-0000-4000-8000-000000000021",
      seq: 1,
      conversation_id: conv2.id,
      user_id: DEMO_USER_ID,
      role: "user",
      content: "Which model should I pick for quick responses?",
      provider_id: null,
      model_id: null,
      status: "complete",
      error: null,
      input_tokens: null,
      output_tokens: null,
      metadata: {},
      created_at: minutesAgo(60 * 26),
      updated_at: minutesAgo(60 * 26),
    },
    {
      id: "40000000-0000-4000-8000-000000000022",
      seq: 2,
      conversation_id: conv2.id,
      user_id: DEMO_USER_ID,
      role: "assistant",
      content:
        "For speed, the small models are the sweet spot: gpt-4o-mini on OpenAI, claude-3-5-haiku on Anthropic, and gemini-1.5-flash on Google. Each provider connection carries a default model, and you can override it per conversation right from the top bar.",
      provider_id: "openai",
      model_id: "gpt-4o-mini",
      status: "complete",
      error: null,
      input_tokens: 19,
      output_tokens: 47,
      metadata: {},
      created_at: minutesAgo(60 * 25),
      updated_at: minutesAgo(60),
    },
  ];

  const usageEvents: UsageEventRow[] = [
    {
      id: uuid(),
      user_id: DEMO_USER_ID,
      conversation_id: conv1.id,
      message_id: "40000000-0000-4000-8000-000000000012",
      provider_id: "openai",
      model_id: "gpt-4o-mini",
      input_tokens: 42,
      output_tokens: 61,
      cost_estimate: 0.00014,
      metadata: {},
      created_at: minutesAgo(117),
    },
    {
      id: uuid(),
      user_id: DEMO_USER_ID,
      conversation_id: conv1.id,
      message_id: "40000000-0000-4000-8000-000000000014",
      provider_id: "openai",
      model_id: "gpt-4o-mini",
      input_tokens: 21,
      output_tokens: 64,
      cost_estimate: 0.00012,
      metadata: {},
      created_at: minutesAgo(59),
    },
    {
      id: uuid(),
      user_id: DEMO_USER_ID,
      conversation_id: conv1.id,
      message_id: "40000000-0000-4000-8000-000000000016",
      provider_id: "openai",
      model_id: "gpt-4o-mini",
      input_tokens: 17,
      output_tokens: 48,
      cost_estimate: 0.00009,
      metadata: {},
      created_at: minutesAgo(2),
    },
    {
      id: uuid(),
      user_id: DEMO_USER_ID,
      conversation_id: conv2.id,
      message_id: "40000000-0000-4000-8000-000000000022",
      provider_id: "openai",
      model_id: "gpt-4o-mini",
      input_tokens: 19,
      output_tokens: 47,
      cost_estimate: 0.0001,
      metadata: {},
      created_at: minutesAgo(60),
    },
  ];

  const conn: ProviderConnectionRow = {
    id: "30000000-0000-4000-8000-000000000001",
    user_id: DEMO_USER_ID,
    provider_id: "openai",
    display_name: "Work key",
    enabled: true,
    base_url: null,
    organization_id: null,
    project_id: null,
    default_model_id: "gpt-4o-mini",
    created_at: minutesAgo(60 * 48),
    updated_at: minutesAgo(60 * 48),
  };

  const db: MockDb = {
    user: {
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      // placeholder hash (recomputed lazily at first sign-in check)
      passwordHash: "pending",
      fullName: DEMO_FULL_NAME,
      createdAt: minutesAgo(60 * 48),
    },
    session: null,
    conversations: [conv1, conv2],
    messages,
    profiles: [
      {
        id: DEMO_USER_ID,
        email: DEMO_EMAIL,
        full_name: DEMO_FULL_NAME,
        created_at: minutesAgo(60 * 48),
        updated_at: minutesAgo(60 * 48),
      },
    ],
    userSettings: [
      {
        user_id: DEMO_USER_ID,
        theme: "system",
        locale: "en",
        send_behavior: "enter-to-send",
        preferences: {},
        updated_at: minutesAgo(60 * 48),
      },
    ],
    usageEvents,
    providers: [
      {
        connection: conn,
        key: {
          status: "active",
          createdAt: minutesAgo(60 * 48),
          lastVerifiedAt: minutesAgo(60 * 48),
          lastUsedAt: minutesAgo(2),
        },
      },
    ],
  };

  // The demo password digest is computed once at seed time.
  void hashPassword(DEMO_PASSWORD).then((hash) => {
    if (db.user) db.user.passwordHash = hash;
    persistMockDb(db);
  });

  return db;
}

/** Load the mock db, seeding demo content on first run. */
export function getMockDb(): MockDb {
  if (dbCache) return dbCache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb;
      if (parsed && Array.isArray(parsed.conversations)) {
        dbCache = parsed;
        return dbCache;
      }
    }
  } catch {
    /* corrupted or unavailable — reseed below */
  }
  dbCache = seedDb();
  persistMockDb(dbCache);
  return dbCache;
}

// --- auth ----------------------------------------------------------------------

export type MockAuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "INITIAL_SESSION";

type AuthListener = (event: MockAuthEvent, session: unknown) => void;

const authListeners = new Set<AuthListener>();

function emitAuthEvent(event: MockAuthEvent, session: unknown): void {
  for (const listener of authListeners) listener(event, session);
}

function toAuthSession(db: MockDb): unknown | null {
  if (!db.session || !db.user) return null;
  return {
    access_token: db.session.accessToken,
    refresh_token: db.session.refreshToken,
    expires_at: db.session.expiresAt,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: db.user.id,
      email: db.user.email,
      aud: "authenticated",
      role: "authenticated",
      created_at: db.user.createdAt,
      updated_at: db.user.createdAt,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { full_name: db.user.fullName },
    },
  };
}

function toAuthUser(db: MockDb): unknown | null {
  if (!db.user) return null;
  return {
    id: db.user.id,
    email: db.user.email,
    aud: "authenticated",
    role: "authenticated",
    created_at: db.user.createdAt,
    updated_at: db.user.createdAt,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: db.user.fullName },
  };
}

/** Seed a starter workspace for a freshly signed-up account. */
async function seedUserWorkspace(db: MockDb, userId: string, email: string): Promise<void> {
  const now = Date.now();
  const minutesAgo = (m: number) => iso(new Date(now - m * 60_000));

  const convId = uuid();
  const msg1Id = uuid();
  const msg2Id = uuid();
  const connId = "30000000-0000-4000-8000-000000000002";

  db.profiles.push({
    id: userId,
    email,
    full_name: null,
    created_at: minutesAgo(0),
    updated_at: minutesAgo(0),
  });
  db.userSettings.push({
    user_id: userId,
    theme: "system",
    locale: "en",
    send_behavior: "enter-to-send",
    preferences: {},
    updated_at: minutesAgo(0),
  });
  db.conversations.push({
    id: convId,
    user_id: userId,
    title: "Welcome to Keyport",
    provider_id: "openai",
    model_id: "gpt-4o-mini",
    system_prompt: null,
    pinned: false,
    archived: false,
    created_at: minutesAgo(0),
    updated_at: minutesAgo(0),
  });
  db.messages.push(
    {
      id: msg1Id,
      seq: 1,
      conversation_id: convId,
      user_id: userId,
      role: "user",
      content: "Hi Keyport! What can this app do?",
      provider_id: null,
      model_id: null,
      status: "complete",
      error: null,
      input_tokens: null,
      output_tokens: null,
      metadata: {},
      created_at: minutesAgo(0),
      updated_at: minutesAgo(0),
    },
    {
      id: msg2Id,
      seq: 2,
      conversation_id: convId,
      user_id: userId,
      role: "assistant",
      content:
        "Welcome aboard. Keyport is a secure chat client that uses your own AI provider keys. Add a provider key in Settings → Providers, then start chatting — responses stream live and usage is tracked on the Usage page.",
      provider_id: "openai",
      model_id: "gpt-4o-mini",
      status: "complete",
      error: null,
      input_tokens: 14,
      output_tokens: 48,
      metadata: {},
      created_at: minutesAgo(0),
      updated_at: minutesAgo(0),
    },
  );
  db.providers.push({
    connection: {
      id: connId,
      user_id: userId,
      provider_id: "openai",
      display_name: "Work key",
      enabled: true,
      base_url: null,
      organization_id: null,
      project_id: null,
      default_model_id: "gpt-4o-mini",
      created_at: minutesAgo(0),
      updated_at: minutesAgo(0),
    },
    key: {
      status: "active",
      createdAt: minutesAgo(0),
      lastVerifiedAt: minutesAgo(0),
      lastUsedAt: null,
    },
  });
  db.usageEvents.push({
    id: uuid(),
    user_id: userId,
    conversation_id: convId,
    message_id: msg2Id,
    provider_id: "openai",
    model_id: "gpt-4o-mini",
    input_tokens: 14,
    output_tokens: 48,
    cost_estimate: 0.0001,
    metadata: {},
    created_at: minutesAgo(0),
  });
}

const authApi = {
  async getSession(): Promise<{ data: { session: unknown | null }; error: null }> {
    const db = getMockDb();
    return { data: { session: toAuthSession(db) }, error: null };
  },

  getUser(): Promise<{ data: { user: unknown | null }; error: null }> {
    const db = getMockDb();
    return Promise.resolve({ data: { user: toAuthUser(db) }, error: null });
  },

  onAuthStateChange(callback: AuthListener): { data: { subscription: { unsubscribe: () => void } } } {
    const listener: AuthListener = (event, session) => callback(event, session);
    authListeners.add(listener);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            authListeners.delete(listener);
          },
        },
      },
    };
  },

  async signUp(input: { email: string; password: string }): Promise<unknown> {
    const db = getMockDb();
    const email = input.email.trim().toLowerCase();
    if (!email.includes("@")) {
      return { data: { user: null, session: null }, error: { message: "Invalid email" } };
    }
    if (input.password.length < 6) {
      return {
        data: { user: null, session: null },
        error: { message: "Password should be at least 6 characters." },
      };
    }
    if (db.user && db.user.email === email) {
      return { data: { user: null, session: null }, error: { message: "User already registered" } };
    }

    const userId = uuid();
    const passwordHash = await hashPassword(input.password);
    db.user = {
      id: userId,
      email,
      passwordHash,
      fullName: null,
      createdAt: iso(new Date()),
    };
    db.session = {
      accessToken: `mock-${uuid()}`,
      refreshToken: `mock-${uuid()}`,
      expiresAt: Date.now() + 60 * 60 * 1000,
      userId,
    };
    await seedUserWorkspace(db, userId, email);
    persistMockDb(db);
    const session = toAuthSession(db);
    emitAuthEvent("SIGNED_IN", session);
    return { data: { user: toAuthUser(db), session }, error: null };
  },

  async signInWithPassword(input: { email: string; password: string }): Promise<unknown> {
    const db = getMockDb();
    const email = input.email.trim().toLowerCase();
    if (!db.user || db.user.email !== email) {
      return {
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      };
    }
    const hash = await hashPassword(input.password);
    if (hash !== db.user.passwordHash) {
      return {
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      };
    }
    db.session = {
      accessToken: `mock-${uuid()}`,
      refreshToken: `mock-${uuid()}`,
      expiresAt: Date.now() + 60 * 60 * 1000,
      userId: db.user.id,
    };
    persistMockDb(db);
    const session = toAuthSession(db);
    emitAuthEvent("SIGNED_IN", session);
    return { data: { user: toAuthUser(db), session }, error: null };
  },

  async signOut(): Promise<{ error: null }> {
    // Mock-mode reset: wipe the whole fixture store so the next tester starts
    // fresh (matches the "sign-out clears the demo dataset" copy in seed data).
    clearMockDb();
    emitAuthEvent("SIGNED_OUT", null);
    return { error: null };
  },

  async resetPasswordForEmail(_email: string): Promise<{ error: null }> {
    return { error: null };
  },

  async updateUser(input: { data?: Record<string, unknown> }): Promise<unknown> {
    const db = getMockDb();
    if (!db.user) return { data: { user: null }, error: { message: "no session" } };
    if (input.data?.full_name !== undefined) {
      db.user.fullName = String(input.data.full_name) || null;
    }
    persistMockDb(db);
    return { data: { user: toAuthUser(db) }, error: null };
  },
};

// --- query builder --------------------------------------------------------------

interface Filter {
  field: string;
  value: unknown;
}

interface SortSpec {
  field: string;
  ascending: boolean;
}

type QueryResult = { data: unknown; error: { message: string } | null };

/** Minimal chainable then-able mirroring the PostgREST surface used by the app. */
class QueryBuilder implements PromiseLike<QueryResult> {
  private readonly tableNameKey: string;
  private filters: Filter[] = [];
  private sort: SortSpec | null = null;
  private sliceStart: number | null = null;
  private sliceEnd: number | null = null;
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Record<string, unknown> | null = null;
  private pickOne: "single" | "maybeSingle" | null = null;

  constructor(tableName: string) {
    this.tableNameKey = tableName;
  }

  select(_columns?: string): this {
    return this;
  }

  eq(field: string, value: unknown): this {
    this.filters.push({ field, value });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }): this {
    this.sort = { field, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number): this {
    this.sliceStart = 0;
    this.sliceEnd = count;
    return this;
  }

  range(from: number, to: number): this {
    this.sliceStart = from;
    this.sliceEnd = to + 1;
    return this;
  }

  insert(payload: Record<string, unknown>): this {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: Record<string, unknown>, _options?: { onConflict?: string }): this {
    this.mode = "upsert";
    this.payload = payload;
    return this;
  }

  delete(): this {
    this.mode = "delete";
    return this;
  }

  single(): this {
    this.pickOne = "single";
    return this;
  }

  maybeSingle(): this {
    this.pickOne = "maybeSingle";
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private tableStore(db: MockDb): Array<Record<string, unknown>> | null {
    const stores: Record<string, Array<Record<string, unknown>>> = {
      conversations: db.conversations as unknown as Array<Record<string, unknown>>,
      messages: db.messages as unknown as Array<Record<string, unknown>>,
      profiles: db.profiles as unknown as Array<Record<string, unknown>>,
      user_settings: db.userSettings as unknown as Array<Record<string, unknown>>,
      usage_events: db.usageEvents as unknown as Array<Record<string, unknown>>,
      provider_connections: db.providers.map((entry) => ({
        ...entry.connection,
      })) as unknown as Array<Record<string, unknown>>,
    };
    return stores[this.tableNameKey] ?? null;
  }

  private match(row: Record<string, unknown>): boolean {
    return this.filters.every((filter) => row[filter.field] === filter.value);
  }

  private execute(): Promise<QueryResult> {
    return new Promise((resolve) => {
      try {
        const db = getMockDb();
        if (!db.session && this.mode !== "select") {
          resolve({ data: null, error: { message: "no session" } });
          return;
        }
        const store = this.tableStore(db);
        if (!store) {
          resolve({
            data: this.pickOne ? null : [],
            error: this.pickOne === "single" ? { message: "table not found" } : null,
          });
          return;
        }

        if (this.mode === "select") {
          let rows = store.filter((row) => this.match(row));
          if (this.sort) {
            const { field, ascending } = this.sort;
            rows = rows.sort((a, b) => {
              const va = a[field] as number | string | null;
              const vb = b[field] as number | string | null;
              if (va === vb) return 0;
              if (va == null) return ascending ? -1 : 1;
              if (vb == null) return ascending ? 1 : -1;
              const cmp = va < vb ? -1 : 1;
              return ascending ? cmp : -cmp;
            });
          }
          if (this.sliceStart !== null) {
            rows = rows.slice(this.sliceStart, this.sliceEnd ?? undefined);
          }
          if (this.pickOne === "single") {
            if (rows.length === 0) {
              resolve({ data: null, error: { message: "The result contains 0 rows" } });
            } else {
              resolve({ data: rows[0], error: null });
            }
          } else if (this.pickOne === "maybeSingle") {
            resolve({ data: rows[0] ?? null, error: null });
          } else {
            resolve({ data: rows, error: null });
          }
          return;
        }

        if (!db.session) {
          resolve({ data: null, error: null });
          return;
        }
        const now = iso(new Date());
        const userId = db.session.userId;

        if (this.mode === "insert") {
          const base: Record<string, unknown> = {
            ...(this.payload ?? {}),
            id: uuid(),
            user_id: userId,
            created_at: now,
            updated_at: now,
          };
          if (this.tableNameKey === "conversations") {
            base.pinned = base.pinned ?? false;
            base.archived = base.archived ?? false;
          }
          if (this.tableNameKey === "messages") {
            base.seq =
              Math.max(0, ...db.messages.map((m) => m.seq)) + 1;
            base.role = base.role ?? "user";
            base.status = base.status ?? "complete";
            base.metadata = base.metadata ?? {};
            base.error = base.error ?? null;
            base.input_tokens = base.input_tokens ?? null;
            base.output_tokens = base.output_tokens ?? null;
            base.provider_id = base.provider_id ?? null;
            base.model_id = base.model_id ?? null;
          }
          store.push(base);
          persistMockDb(db);
          resolve({ data: this.pickOne === "single" ? base : [base], error: null });
          return;
        }

        if (this.mode === "update") {
          const matched: Array<Record<string, unknown>> = [];
          for (const row of store) {
            if (this.match(row)) {
              Object.assign(row, this.payload ?? {}, { updated_at: now });
              matched.push(row);
            }
          }
          persistMockDb(db);
          if (this.pickOne === "single") {
            if (matched.length === 0) {
              resolve({ data: null, error: { message: "The result contains 0 rows" } });
            } else {
              resolve({ data: matched[0], error: null });
            }
          } else if (this.pickOne === "maybeSingle") {
            resolve({ data: matched[0] ?? null, error: null });
          } else {
            resolve({ data: matched, error: null });
          }
          return;
        }

        if (this.mode === "upsert") {
          const conflictField = "user_id";
          const conflictValue = this.payload?.[conflictField] ?? userId;
          const existing = store.find((row) => row[conflictField] === conflictValue);
          let row: Record<string, unknown>;
          if (existing) {
            Object.assign(existing, this.payload ?? {}, { updated_at: now });
            row = existing;
          } else {
            row = { ...(this.payload ?? {}), user_id: userId, updated_at: now };
            store.push(row);
          }
          persistMockDb(db);
          resolve({ data: this.pickOne === "single" ? row : [row], error: null });
          return;
        }

        if (this.mode === "delete") {
          const keep: typeof store = [];
          for (const row of store) {
            if (!this.match(row)) keep.push(row);
          }
          store.splice(0, store.length, ...keep);
          persistMockDb(db);
          resolve({ data: [], error: null });
          return;
        }

        resolve({ data: null, error: null });
      } catch (err) {
        resolve({
          data: null,
          error: { message: err instanceof Error ? err.message : "mock query failed" },
        });
      }
    });
  }
}

// --- client facade --------------------------------------------------------------

let supabaseMock: unknown | null = null;

export function getMockSupabase(): unknown {
  if (supabaseMock) return supabaseMock;

  supabaseMock = {
    auth: authApi,

    from(tableName: string): QueryBuilder {
      return new QueryBuilder(tableName);
    },

    rpc(): Promise<QueryResult> {
      return Promise.resolve({ data: [], error: null });
    },

    channel(): { subscribe: () => void; unsubscribe: () => void; on: () => unknown } {
      return {
        subscribe: () => undefined,
        unsubscribe: () => undefined,
        on: () => ({ subscribe: () => undefined }),
      };
    },

    removeAllSubscriptions(): Promise<{ error: null }> {
      return Promise.resolve({ error: null });
    },

    realTime: { connect: () => undefined, disconnect: () => undefined },

    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: { path: "" }, error: null }),
        download: () => Promise.resolve({ data: new Blob(), error: null }),
      }),
    },
  };

  return supabaseMock;
}