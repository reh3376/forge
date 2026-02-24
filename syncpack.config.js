module.exports = {
  source: [
    'package.json',
    'apps/*/package.json'
  ],
  indent: '  ',
  semverGroups: [
    {
      label: 'Use exact version for TypeScript packages',
      packages: ['typescript', '@types/*'],
      dependencyTypes: ['dev', 'prod'],
      range: '',
    },
    {
      label: 'Use caret ranges for all dependencies',
      packages: ['**'],
      dependencyTypes: ['dev', 'prod'],
      range: '^',
    },
  ],
  sortFirst: [
    'name',
    'version',
    'private',
    'description',
    'main',
    'types',
    'scripts',
    'dependencies',
    'devDependencies',
    'peerDependencies',
  ],
  sortAz: [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'scripts',
  ],
  versionGroups: [
    {
      label: 'Use same version for TypeScript',
      packages: ['typescript'],
      isIgnored: false,
    },
    {
      label: 'Use same version for Jest packages',
      packages: ['jest', '@types/jest', 'ts-jest'],
      isIgnored: false,
    },
    {
      label: 'Use same version for React packages',
      packages: ['react', 'react-dom', '@types/react', '@types/react-dom'],
      isIgnored: false,
    },
  ],
}; 