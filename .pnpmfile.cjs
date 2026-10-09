// Side-by-side TS: the repo compiles with typescript@7 (tsc), but
// typescript-eslint still requires the typescript@6 JS API (ts.SyntaxKind
// etc. were removed in TS 7's native API). Swap the eslint plugin chain's
// peer on `typescript` for a real typescript@6 dependency so its
// `require("typescript")` resolves to 6 regardless of the root install.
// Track: https://github.com/typescript-eslint/typescript-eslint/issues/10940
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (
        pkg.name === "typescript-eslint" ||
        pkg.name.startsWith("@typescript-eslint/")
      ) {
        const { typescript: _peer, ...peers } = pkg.peerDependencies ?? {};
        pkg.peerDependencies = peers;
        pkg.dependencies = {
          ...pkg.dependencies,
          typescript: "6.0.3",
        };
      }
      return pkg;
    },
  },
};
