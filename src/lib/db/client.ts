import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export interface Filter {
  type: "eq" | "neq" | "in";
  column: string;
  value: any;
}

interface OrderConfig {
  column: string;
  ascending: boolean;
}

interface SerializedQuery {
  table: string;
  filters: Filter[];
  order: OrderConfig | null;
  single: boolean;
  maybeSingle: boolean;
  limit: number | null;
}

export interface DbError {
  message: string;
  code?: string;
}

export interface DbResult<T = any> {
  data: T | null;
  error: DbError | null;
}

/**
 * Same chaining surface as the old MockQueryBuilder (Supabase-style), so
 * ported callsites only need `createClient()` swapped for `db` — the
 * `.from().select().eq()...` bodies stay unchanged.
 */
export class QueryBuilder<T = any> {
  private filters: Filter[] = [];
  private orderConfig: OrderConfig | null = null;
  private singleResult = false;
  private isMaybeSingle = false;
  private limitCount: number | null = null;
  private action = "select";
  private actionData: any = undefined;

  constructor(private table: string) {}

  select(_columns: string = "*") {
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ type: "neq", column, value });
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push({ type: "in", column, value: values });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderConfig = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.singleResult = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  insert(data: any) {
    this.action = "insert";
    this.actionData = data;
    return this;
  }

  update(data: any) {
    this.action = "update";
    this.actionData = data;
    return this;
  }

  upsert(data: any, _options?: any) {
    this.action = "upsert";
    this.actionData = data;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  // Makes `await db.from(...).select()...` work like a real promise.
  then<TResult1 = DbResult<T>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined) as Promise<TResult1 | TResult2>;
  }

  private execute(): Promise<DbResult<T>> {
    const query: SerializedQuery = {
      table: this.table,
      filters: this.filters,
      order: this.orderConfig,
      single: this.singleResult,
      maybeSingle: this.isMaybeSingle,
      limit: this.limitCount,
    };
    return invoke<DbResult<T>>("db_query", { query, action: this.action, data: this.actionData });
  }
}

async function blobLikeToBase64(fileBody: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  if (fileBody instanceof Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(fileBody);
    });
  }
  const bytes = fileBody instanceof Uint8Array ? fileBody : new Uint8Array(fileBody);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBlob(base64: string): Blob {
  const chars = atob(base64);
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
  return new Blob([bytes]);
}

// Cached at app bootstrap via initDesktopDb() so getPublicUrl() can stay
// synchronous, matching the old supabase-style call signature.
let storageDirCache: string | null = null;

export async function initDesktopDb(): Promise<void> {
  storageDirCache = await invoke<string>("storage_dir_path");
}

function requireStorageDir(): string {
  if (storageDirCache === null) {
    throw new Error("DesktopDbClient not initialized — call initDesktopDb() before using storage.getPublicUrl()");
  }
  return storageDirCache;
}

function bucketAbsolutePath(bucket: string, path: string): string {
  const dir = requireStorageDir();
  return bucket === "courses" ? `${dir}/${path}` : `${dir}/${bucket}/${path}`;
}

class StorageBucket {
  constructor(private bucket: string) {}

  async upload(path: string, fileBody: Blob | ArrayBuffer | Uint8Array, _options?: any): Promise<DbResult<{ path: string }>> {
    const fileDataBase64 = await blobLikeToBase64(fileBody);
    return invoke<DbResult<{ path: string }>>("storage_upload", { bucket: this.bucket, path, fileDataBase64 });
  }

  async download(path: string): Promise<{ data: Blob | null; error: DbError | null }> {
    const result = await invoke<DbResult<{ base64: string }>>("storage_download", { bucket: this.bucket, path });
    if (result.error || !result.data) return { data: null, error: result.error };
    return { data: base64ToBlob(result.data.base64), error: null };
  }

  // Requires initDesktopDb() to have run, and (from Phase 2) the app data
  // dir to be allowlisted for the `asset:` protocol in tauri.conf.json.
  getPublicUrl(path: string): { data: { publicUrl: string } } {
    return { data: { publicUrl: convertFileSrc(bucketAbsolutePath(this.bucket, path)) } };
  }

  async createSignedUrl(path: string, _expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: DbError | null }> {
    return { data: { signedUrl: this.getPublicUrl(path).data.publicUrl }, error: null };
  }
}

export class DesktopDbClient {
  from<T = any>(table: string) {
    return new QueryBuilder<T>(table);
  }

  async rpc(fn: string, args?: any): Promise<DbResult> {
    return invoke<DbResult>("db_rpc", { fn, args });
  }

  storage = {
    from: (bucket: string) => new StorageBucket(bucket),
  };
}

export const db = new DesktopDbClient();

// Desktop app is single-user by design — no auth layer.
export const LOCAL_USER_ID = "local-user-id";
