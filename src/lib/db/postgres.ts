import { Pool, QueryResult, QueryResultRow } from "pg";
import { randomUUID } from "crypto";

/**
 * Minimal PocketBase-like API built on top of PostgreSQL (Neon).
 *
 * Implements the subset of the PocketBase client that the app actually uses
 * while preserving the app's existing expectations:
 *  - field names are camelCase (matching the PocketBase collections) and are
 *    stored as quoted PostgreSQL identifiers so case is preserved
 *  - `getFullList` returns a plain array
 *  - `getList` returns `{ items, totalItems, page, perPage, totalPages }`
 *  - string `filter`/`sort` options use PocketBase syntax
 *    (e.g. `scanId = "abc" && aheadBy > 0`, `-score`)
 *  - object/array values (JSON-ish fields like `topFiles`, `commitsJson`) are
 *    serialized to text on write, matching how callers JSON.parse them on read
 *
 * Only the methods used by the application are implemented.
 */
export class PostgresDB {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  /** Quote a SQL identifier so PostgreSQL preserves its exact case. */
  private static ident(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  /** Serialize object/array values to text; pass primitives/null through.
   *  Date objects are stored as ISO strings (matching the app's runtime
   *  `new Date(...)` writes and how the migration normalizes timestamps). */
  private static serialize(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") return JSON.stringify(value);
    return value;
  }

  /**
   * Parse a PocketBase-style filter string into a SQL WHERE clause with
   * positional parameters. Supports `= != > >= < <=`, `&&`/`||`, parentheses,
   * double-quoted string literals and numeric literals. Field names must be
   * plain identifiers (they are used as column names).
   */
  private static buildWhere(
    filter: string | undefined,
    params: unknown[]
  ): string {
    if (!filter) return "";
    const tokens = PostgresDB.tokenize(filter);
    let pos = 0;

    const expect = (value: string) => {
      const tok = tokens[pos];
      if (!tok || tok.value !== value) {
        throw new Error(`Invalid filter: expected "${value}" near "${filter}"`);
      }
      pos++;
    };

    const parseValue = (tok: { type: string; value: string }): unknown => {
      if (tok.type === "string" || tok.type === "number") {
        params.push(tok.value);
        return `$${params.length}`;
      }
      throw new Error(`Invalid filter: unexpected token "${tok.value}"`);
    };

    const parseComparison = (): string => {
      const field = tokens[pos];
      if (!field || field.type !== "word") {
        throw new Error(`Invalid filter: expected field name near "${filter}"`);
      }
      pos++;
      const op = tokens[pos];
      const ops: Record<string, string> = {
        "=": "=",
        "!=": "<>",
        ">": ">",
        ">=": ">=",
        "<": "<",
        "<=": "<=",
      };
      if (!op || !ops[op.value]) {
        throw new Error(`Invalid filter: expected operator near "${filter}"`);
      }
      pos++;
      const value = tokens[pos];
      if (!value) {
        throw new Error(`Invalid filter: expected value near "${filter}"`);
      }
      pos++;
      const col = PostgresDB.ident(field.value);
      return `${col} ${ops[op.value]} ${parseValue(value)}`;
    };

    const parseUnary = (): string => {
      if (tokens[pos]?.value === "(") {
        pos++;
        const inner = parseOr();
        expect(")");
        return `(${inner})`;
      }
      return parseComparison();
    };

    const parseAnd = (): string => {
      const parts = [parseUnary()];
      while (tokens[pos]?.value === "&&") {
        pos++;
        parts.push(parseUnary());
      }
      return parts.join(" AND ");
    };

    const parseOr = (): string => {
      const parts = [parseAnd()];
      while (tokens[pos]?.value === "||") {
        pos++;
        parts.push(parseAnd());
      }
      return parts.join(" OR ");
    };

    const where = parseOr();
    if (pos !== tokens.length) {
      throw new Error(`Invalid filter: trailing tokens near "${filter}"`);
    }
    return `WHERE ${where}`;
  }

  /** Parse a PocketBase-style sort string (`-score`, `startedAt, -updatedAt`). */
  private static buildOrder(sort: string | undefined): string {
    if (!sort) return "";
    const parts = sort
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const desc = s.startsWith("-");
        const name = desc ? s.slice(1) : s;
        return `${PostgresDB.ident(name)} ${desc ? "DESC" : "ASC"}`;
      });
    return parts.length ? `ORDER BY ${parts.join(", ")}` : "";
  }

  /** Tokenize a filter expression into words/strings/numbers/operators. */
  private static tokenize(
    filter: string
  ): { type: string; value: string }[] {
    const tokens: { type: string; value: string }[] = [];
    let i = 0;
    while (i < filter.length) {
      const ch = filter[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      const two = filter.slice(i, i + 2);
      if (
        two === "&&" ||
        two === "||" ||
        two === ">=" ||
        two === "<=" ||
        two === "!="
      ) {
        tokens.push({ type: "op", value: two });
        i += 2;
        continue;
      }
      if (ch === "(" || ch === ")") {
        tokens.push({ type: "op", value: ch });
        i++;
        continue;
      }
      if (ch === "=" || ch === ">" || ch === "<") {
        tokens.push({ type: "op", value: ch });
        i++;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        let value = "";
        while (j < filter.length && filter[j] !== '"') {
          if (filter[j] === "\\" && j + 1 < filter.length) {
            value += filter[j + 1];
            j += 2;
            continue;
          }
          value += filter[j];
          j++;
        }
        if (filter[j] !== '"') {
          throw new Error(
            `Invalid filter: unterminated string near "${filter}"`
          );
        }
        tokens.push({ type: "string", value });
        i = j + 1;
        continue;
      }
      if (/[0-9.\-]/.test(ch)) {
        let j = i;
        while (j < filter.length && /[0-9.\-]/.test(filter[j])) j++;
        tokens.push({ type: "number", value: filter.slice(i, j) });
        i = j;
        continue;
      }
      if (/[a-zA-Z_]/.test(ch)) {
        let j = i;
        while (j < filter.length && /[a-zA-Z0-9_]/.test(filter[j])) j++;
        tokens.push({ type: "word", value: filter.slice(i, j) });
        i = j;
        continue;
      }
      throw new Error(`Invalid filter: unexpected character "${ch}"`);
    }
    return tokens;
  }

  /** Return a collection-like object with the limited methods we need. */
  collection(name: string) {
    const db = this;
    const table = PostgresDB.ident(name);

    async function create(data: Record<string, any>) {
      const row = { ...data };
      if (row.id === undefined) row.id = randomUUID();
      const cols = Object.keys(row);
      const vals = cols.map((c) => PostgresDB.serialize(row[c]));
      const colList = cols.map(PostgresDB.ident).join(", ");
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) RETURNING *`;
      const res = await db.query(sql, vals);
      return res.rows[0];
    }

    async function update(id: string, data: Record<string, any>) {
      const cols = Object.keys(data);
      const vals = cols.map((c) => PostgresDB.serialize(data[c]));
      const assignments = cols
        .map((c, i) => `${PostgresDB.ident(c)} = $${i + 1}`)
        .join(", ");
      const sql = `UPDATE ${table} SET ${assignments} WHERE id = $${cols.length + 1} RETURNING *`;
      const res = await db.query(sql, [...vals, id]);
      if (res.rowCount === 0) {
        const err: any = new Error("Not found");
        err.status = 404;
        throw err;
      }
      return res.rows[0];
    }

    async function getOne(id: string) {
      const sql = `SELECT * FROM ${table} WHERE id = $1`;
      const res = await db.query(sql, [id]);
      if (res.rowCount === 0) {
        const err: any = new Error("Not found");
        err.status = 404;
        throw err;
      }
      return res.rows[0];
    }

    async function getList(page: number, perPage: number, opts: any = {}) {
      const offset = (page - 1) * perPage;
      const params: unknown[] = [perPage, offset];
      const where = PostgresDB.buildWhere(opts.filter, params);
      const order = PostgresDB.buildOrder(opts.sort);

      const countParams: unknown[] = [];
      const countWhere = PostgresDB.buildWhere(opts.filter, countParams);
      const countSql = `SELECT COUNT(*) AS total FROM ${table} ${countWhere}`;
      const countRes = await db.query<{ total: string }>(countSql, countParams);
      const totalItems = Number(countRes.rows[0]?.total ?? 0);

      const sql = `SELECT * FROM ${table} ${where} ${order} LIMIT $1 OFFSET $2`;
      const res = await db.query(sql, params);
      return {
        items: res.rows,
        totalItems,
        page,
        perPage,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / perPage),
      };
    }

    async function getFullList(opts: any = {}) {
      const params: unknown[] = [];
      const where = PostgresDB.buildWhere(opts.filter, params);
      const order = PostgresDB.buildOrder(opts.sort);
      const sql = `SELECT * FROM ${table} ${where} ${order}`;
      const res = await db.query(sql, params);
      // PocketBase returns a plain array here; callers rely on `.length`/`.map`.
      return res.rows;
    }

    async function delete_(id: string) {
      const sql = `DELETE FROM ${table} WHERE id = $1`;
      await db.query(sql, [id]);
    }

    return { create, update, getOne, getList, getFullList, delete: delete_ };
  }

  async close() {
    await this.pool.end();
  }
}

