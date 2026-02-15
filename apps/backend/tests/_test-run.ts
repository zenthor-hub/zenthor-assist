import type { InMemoryConvexDb } from "./_test-fakes";

export type TestConvexContext = {
  db: InMemoryConvexDb;
  auth?: {
    user?: {
      _id: string;
    };
    getUserIdentity?: () => Promise<{ subject: string }>;
  };
};

export async function runMutation<TArgs, TReturn>(
  mutation: unknown,
  ctx: TestConvexContext,
  args: TArgs,
): Promise<TReturn> {
  const fn = mutation as {
    _handler: (ctx: TestConvexContext, args: TArgs) => Promise<TReturn>;
  };
  return fn._handler(ctx, args);
}

export async function runQuery<TArgs, TReturn>(
  query: unknown,
  ctx: TestConvexContext,
  args: TArgs,
): Promise<TReturn> {
  const fn = query as {
    _handler: (ctx: TestConvexContext, args: TArgs) => Promise<TReturn>;
  };
  return fn._handler(ctx, args);
}
