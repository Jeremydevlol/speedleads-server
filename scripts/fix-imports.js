import { replaceInFileSync } from 'replace-in-file';

const options = {
  files: 'dist/**/*.js',
  from: /\.ts'/g,  // Busca las importaciones de .ts
  to: '.js'        // Reemplaza con .js
};

try {
  const results = replaceInFileSync(options);
  console.log('Modified files:', results);
} catch (error) {
  console.error('Error occurred:', error);
}
