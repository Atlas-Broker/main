import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  // Force CJS resolution for LangGraph/LangChain packages (avoid browser ESM entry)
  moduleNameMapper: {
    "^@langchain/langgraph$": "<rootDir>/node_modules/@langchain/langgraph/dist/index.cjs",
    "^@langchain/langgraph/(.*)$": "<rootDir>/node_modules/@langchain/langgraph/dist/$1",
    "^@langchain/google-genai$": "<rootDir>/node_modules/@langchain/google-genai/dist/index.cjs",
    "^@langchain/core/(.*)$": "<rootDir>/node_modules/@langchain/core/dist/$1",
    "^@langchain/core$": "<rootDir>/node_modules/@langchain/core/dist/index.cjs",
    "^@/(.*)$": "<rootDir>/$1",
    "^@clerk/nextjs/server$": "<rootDir>/__mocks__/@clerk/nextjs/server.ts",
    "^@clerk/themes$": "<rootDir>/__mocks__/@clerk/themes.ts",
  },
  testMatch: ["**/__tests__/**/*.test.(ts|tsx)"],
};

export default config;
