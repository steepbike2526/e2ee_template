import type { ParseOptions, SerializeOptions } from 'cookie';

declare module 'cookie' {
  interface CookieParseOptions extends ParseOptions {}
  interface CookieSerializeOptions extends SerializeOptions {}
}

declare namespace App {}
