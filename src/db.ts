/**
 * The catalogue database: SQLite, built into the image by `scripts/seed.ts` and opened read-only.
 *
 * Every query runs inside a span, so a request's trace shows each query it made and how long it took.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

const tracer = trace.getTracer('website.db');

export interface Database {
  /** Runs a named query and returns its rows. The name is the span's, so keep it short and stable. */
  all<Row>(name: string, sql: string, params?: Record<string, SQLInputValue>): Row[];
  /** As `all`, for a query that returns at most one row. */
  get<Row>(name: string, sql: string, params?: Record<string, SQLInputValue>): Row | undefined;
  close(): void;
}

export function openDatabase(file: string): Database {
  const db = new DatabaseSync(file, { readOnly: true });
  const statements = new Map<string, ReturnType<DatabaseSync['prepare']>>();

  function all<Row>(name: string, sql: string, params: Record<string, SQLInputValue> = {}): Row[] {
    return tracer.startActiveSpan(
      name,
      { kind: SpanKind.CLIENT, attributes: { 'db.system.name': 'sqlite', 'db.query.text': sql } },
      (span) => {
        try {
          let statement = statements.get(sql);
          if (!statement) {
            statement = db.prepare(sql);
            statements.set(sql, statement);
          }
          const rows = statement.all(params) as Row[];
          span.setAttribute('db.response.returned_rows', rows.length);
          return rows;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  return {
    all,
    get: (name, sql, params) => all<never>(name, sql, params)[0],
    close: () => db.close(),
  };
}
