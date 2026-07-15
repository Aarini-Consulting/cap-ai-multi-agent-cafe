import { Annotation } from "@langchain/langgraph";

export const CafeOrchestratorState = Annotation.Root({
  userMessage: Annotation,

  conversationHistory: Annotation({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  nextAgent: Annotation({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  iterationCount: Annotation({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  cafeAssistantResult: Annotation({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  kitchenManagerResult: Annotation({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  grievanceManagerResult: Annotation({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  finalResponse: Annotation({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
});
