/**
 * Environment variables this frontend reads by name.
 *
 * `process.env` is an index signature, and the compiler (noPropertyAccessFromIndexSignature)
 * refuses dotted access to a name it does not know. Declaring the names here keeps the
 * dotted form, which is the form Next.js replaces at build time for NEXT_PUBLIC_ variables;
 * a computed lookup is not guaranteed to be inlined into the browser bundle.
 * Every variable is optional: read it as `string | undefined`.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly CI?: string
    readonly VERCEL?: string
    readonly VERCEL_ENV?: string
    readonly VERCEL_URL?: string
    readonly NEXT_PUBLIC_AZURE_AD_CLIENT_ID?: string
    readonly NEXT_PUBLIC_AZURE_AD_TENANT_ID?: string
    readonly NEXT_PUBLIC_AZURE_AUTHORITY?: string
    readonly NEXT_PUBLIC_AZURE_REDIRECT_URI?: string
    readonly NEXT_PUBLIC_AZURE_LOGOUT_URI?: string
    readonly NEXT_PUBLIC_DISABLE_DEV_MODE?: string
    readonly NEXT_PUBLIC_ENABLE_DEMO_USER?: string
    readonly NEXT_PUBLIC_E2E_AUTO_LOGIN?: string
  }
}
