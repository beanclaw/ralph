module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  preset: "ts-jest",
  rootDir: ".",
  roots: ["<rootDir>/src"],
  testEnvironment: "node",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.spec.json"
      }
    ]
  },
  clearMocks: true
};
