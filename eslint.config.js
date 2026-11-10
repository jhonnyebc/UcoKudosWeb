import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Reglas del cliente.
 *
 * La que no es estándar y es la que más importa aquí es `no-restricted-properties` sobre el
 * almacenamiento del navegador: impide guardar nada en `localStorage` ni en `sessionStorage`. No es
 * una manía, es ADR-0015 punto 6 convertido en algo que una revisión no puede olvidar. Un token en
 * almacenamiento local queda al alcance de cualquier script inyectado, y es el tipo de descuido que
 * se cuela en un momento de prisa.
 */
export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      'no-restricted-properties': [
        'error',
        {
          object: 'localStorage',
          message:
            'El token y los datos de sesión van en memoria (ADR-0015). El almacenamiento local es legible por cualquier script inyectado.',
        },
        {
          object: 'sessionStorage',
          message:
            'El token y los datos de sesión van en memoria (ADR-0015). El almacenamiento de sesión es legible por cualquier script inyectado.',
        },
      ],

      // Pintar HTML construido a mano es la vía directa a inyectar código en la pantalla de otro.
      'react-no-danger': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.prueba.{ts,tsx}', 'src/pruebas/**'],
    rules: {
      // En las pruebas se construyen datos falsos a propósito; exigir aquí la misma rigidez solo
      // produce ruido.
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    // El orden importa: la desactivación va primero, porque reemplaza `languageOptions` entera y
    // se llevaría por delante los globales de Node si fuera después.
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
);
