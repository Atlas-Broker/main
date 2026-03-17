import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@clerk/nextjs/server$": "<rootDir>/__mocks__/@clerk/nextjs/server.ts",
    "^@clerk/themes$": "<rootDir>/__mocks__/@clerk/themes.ts",
  },
  testMatch: ["**/__tests__/**/*.test.(ts|tsx)"],
};

export default config;
