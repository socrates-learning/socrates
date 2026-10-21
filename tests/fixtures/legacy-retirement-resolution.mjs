import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
// Resolve the repository's extensionless TypeScript imports for Node tests only.
registerHooks({ resolve(specifier, context, next) {
 if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
  const path = new URL(specifier+'.ts', context.parentURL);
  if (existsSync(path)) return next(path.href, context);
 }
 return next(specifier, context);
} });
