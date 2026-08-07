// Shared domain types for quizforge. The SSE event union lands here
// with Phase 3.5 (see docs/PLAN.md).

export const SHARED_PACKAGE = "@quizforge/shared";

// The extensionless specifier is deliberate: the swc-node dev runner
// does not resolve "./quiz.js" style imports to .ts sources (see the
// importFileExtension note in server/prisma/schema.prisma). That is
// also why this package declares no "type": "module".
export * from "./quiz";
