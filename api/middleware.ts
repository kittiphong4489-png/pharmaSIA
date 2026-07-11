import { initTRPC, TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context";
import { verifyToken } from "./lib/auth";

const t = initTRPC.context<TrpcContext>().create({});

export const createRouter = t.router;
export const publicQuery = t.procedure;
export const publicMutation = t.procedure;

// Middleware: require valid JWT token
const isAuthenticated = t.middleware(async ({ ctx, next }) => {
  const authHeader = ctx.req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing or invalid authorization header" });
  }
  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  if (!payload) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired token" });
  }
  return next({ ctx: { ...ctx, user: payload } });
});

export const protectedProcedure = t.procedure.use(isAuthenticated);
