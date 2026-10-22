const pkg = require('./package.json');
const j = pkg.jest;
module.exports = {
  ...j,
  rootDir: __dirname,
  modulePaths: ['<rootDir>/../node_modules'],
  moduleNameMapper: {
    '^@/infrastructure/(.*)$': '<rootDir>/../src/infrastructure/$1',
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
    ...j.moduleNameMapper,
  },
};
