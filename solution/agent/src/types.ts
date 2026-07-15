import { Annotation } from "@langchain/langgraph";

export const CafeOrchestratorState = Annotation.Root({
  userMessage: Annotation<string>,

  conversationHistory: Annotation<Array<{ role: string; content: string }>>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  nextAgent: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  iterationCount: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  cafeAssistantResult: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  kitchenManagerResult: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  grievanceManagerResult: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  finalResponse: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
});

export type CafeOrchestratorStateType = typeof CafeOrchestratorState.State;
