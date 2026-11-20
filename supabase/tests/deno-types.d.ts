/** Compile-only declarations for checking Edge wiring with the repository's TypeScript compiler.
 * This does not replace `deno check` or Supabase runtime tests before deployment. */
declare namespace Deno {
  const env: { get(name: string): string | undefined };
  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}
