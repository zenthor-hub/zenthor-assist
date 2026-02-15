type AnyDocument = {
  _id: string;
  _creationTime: number;
  [key: string]: unknown;
};

type TableName = "agentQueue" | "conversations" | "noteFolders" | "notes" | "messages" | "users";
type Predicate = (doc: AnyDocument) => boolean;
type TableData = Map<string, AnyDocument>;

const queryOps = {
  field: (field: string) => (doc: AnyDocument) => doc[field],
  resolveValue: (input: unknown, doc: AnyDocument): unknown => {
    if (typeof input === "function") {
      return input(doc);
    }
    if (typeof input === "string" && Object.prototype.hasOwnProperty.call(doc, input)) {
      return doc[input];
    }
    return input;
  },
  eq: (left: unknown, right: unknown): Predicate => {
    return (doc) => {
      const value = queryOps.resolveValue(left, doc);
      return value === right;
    };
  },
  lt: (left: unknown, right: number): Predicate => {
    return (doc) => {
      const value = queryOps.resolveValue(left, doc);
      return Number(value) < right;
    };
  },
};

function toPredicate(result: unknown): Predicate {
  if (typeof result === "function") {
    return result as Predicate;
  }
  return () => !!result;
}

class InMemoryQuery {
  private filters: Predicate[] = [];
  private orderDirection: "asc" | "desc" = "asc";

  constructor(private readonly docs: TableData) {}

  withIndex(
    _indexName: string,
    predicate?: (builder: typeof queryOps) => boolean | Predicate,
  ): InMemoryQuery {
    if (predicate) {
      this.filters.push(toPredicate(predicate(queryOps)));
    }
    return this;
  }

  filter(predicate: (builder: typeof queryOps) => boolean | Predicate): this {
    this.filters.push(toPredicate(predicate(queryOps)));
    return this;
  }

  order(direction: "asc" | "desc"): this {
    this.orderDirection = direction;
    return this;
  }

  async take(limit: number): Promise<AnyDocument[]> {
    return this.execute().slice(0, limit);
  }

  async collect(): Promise<AnyDocument[]> {
    return this.execute();
  }

  async first(): Promise<AnyDocument | null> {
    return this.execute()[0] ?? null;
  }

  private execute(): AnyDocument[] {
    const filtered = [...this.docs.values()].filter((doc) => {
      return this.filters.every((predicate) => predicate(doc));
    });

    filtered.sort((a, b) =>
      this.orderDirection === "desc"
        ? b._creationTime - a._creationTime
        : a._creationTime - b._creationTime,
    );

    return filtered;
  }
}

export class InMemoryConvexDb {
  private tables: Record<TableName, TableData> = {
    agentQueue: new Map(),
    conversations: new Map(),
    noteFolders: new Map(),
    notes: new Map(),
    messages: new Map(),
    users: new Map(),
  };

  private readonly tableById = new Map<string, TableName>();

  private sequence = 0;
  private idCounters: Record<TableName, number> = {
    agentQueue: 0,
    conversations: 0,
    noteFolders: 0,
    notes: 0,
    messages: 0,
    users: 0,
  };

  query(table: TableName): InMemoryQuery {
    return new InMemoryQuery(this.tables[table]);
  }

  async get(id: string): Promise<AnyDocument | null> {
    const table = this.tableById.get(id);
    if (!table) return null;
    const doc = this.tables[table].get(id);
    return doc ?? null;
  }

  async insert(
    table: TableName,
    document: Omit<AnyDocument, "_id" | "_creationTime">,
    forcedId?: string,
  ): Promise<string> {
    const id = forcedId ?? `${table}_${++this.idCounters[table]}`;
    const entry = {
      ...document,
      _id: id,
      _creationTime: ++this.sequence,
    };
    this.tables[table].set(id, entry);
    this.tableById.set(id, table);
    return id;
  }

  async patch(id: string, patch: Record<string, unknown>): Promise<void> {
    const table = this.tableById.get(id);
    if (!table) return;
    const doc = this.tables[table].get(id);
    if (!doc) return;
    this.tables[table].set(id, { ...doc, ...patch });
  }

  async delete(id: string): Promise<void> {
    const table = this.tableById.get(id);
    if (!table) return;
    this.tables[table].delete(id);
    this.tableById.delete(id);
  }

  getTable(table: TableName): TableData {
    return this.tables[table];
  }
}

export function makeAuthContext(userId: string, db: InMemoryConvexDb) {
  return {
    db,
    auth: {
      getUserIdentity: async () => ({ subject: userId }),
      user: {
        _id: userId,
      },
    },
  };
}
