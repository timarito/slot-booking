// Типы переменных окружения Vite. В клиентский бандл попадают только переменные с префиксом
// VITE_: Vite вшивает их значения в код при сборке, поэтому секретов здесь быть не может.
// https://vite.dev/guide/env-and-mode#intellisense-for-typescript
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
