// Единый flat config ESLint для всего монорепо. У каждого workspace свой блок.
// Документация: https://eslint.org/docs/latest/use/configure/configuration-files
//               https://typescript-eslint.io/getting-started/typed-linting
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Результаты сборки и сгенерированный код линтить не нам.
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'apps/api/src/generated/**'],
  },

  js.configs.recommended,

  // Пресеты "type-checked" используют компилятор TypeScript, а не только синтаксис. Они ловят баги,
  // которые обычный линтинг не видит, например забытый `await` (no-floating-promises): на сервере
  // это необработанная ошибка или ответ, отправленный раньше, чем завершилась запись в БД.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Автоматически находит ближайший tsconfig.json для каждого файла.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Подчёркивание в начале имени помечает намеренно неиспользуемый параметр
      // (например, при реализации интерфейса).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [
      // Правила хуков: rules-of-hooks (хуки только на верхнем уровне компонента), exhaustive-deps
      // (полные массивы зависимостей) и правила чистоты рендера из React Compiler. Сам компилятор
      // выключен (CLAUDE.md), но его правила ловят те же ошибки, что ломают ручную мемоизацию.
      reactHooks.configs.flat.recommended,
      // Fast Refresh (HMR без потери состояния) работает, только если модуль экспортирует
      // одни компоненты. Иначе Vite перезагружает страницу целиком — правило предупреждает об этом.
      reactRefresh.configs.vite(),
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // vite.config.ts выполняется в Node, а не в браузере.
    files: ['apps/web/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // Обычные JS-конфиги (как этот) не входят ни в один tsconfig — линтим их без типов.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Должен быть последним: выключает все стилистические правила, которые конфликтуют с Prettier.
  // Форматирование — работа Prettier, ESLint ищет только баги и плохие паттерны.
  prettier,
);
