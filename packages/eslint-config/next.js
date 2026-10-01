import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';
import base from './base.js';

export default [
  ...base,
  ...nextVitals,
  ...nextTypeScript,
  {
    // eslint-plugin-react's `version: 'detect'` calls context.getFilename(), which ESLint 10
    // removed. Pin the React major explicitly so the plugin never takes that path.
    settings: { react: { version: '19' } },
  },
];
