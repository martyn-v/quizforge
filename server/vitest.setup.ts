// LangSmith reads the tracing variables at call time. Force tracing off
// so unit tests never send runs when the shell exports the variables.
delete process.env.LANGCHAIN_TRACING_V2;
delete process.env.LANGSMITH_TRACING_V2;
delete process.env.LANGCHAIN_TRACING;
process.env.LANGSMITH_TRACING = "false";
