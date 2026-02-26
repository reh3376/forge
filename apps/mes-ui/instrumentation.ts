/**
 * Next.js Instrumentation - runs at application startup
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * SECURITY: Validates required environment variables in production to prevent
 * hardcoded credential fallbacks from being used.
 */

export async function register() {
  // Only validate in production - development can use fallbacks
  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 Development mode - skipping strict environment validation')
    return
  }

  console.log('🔐 Production mode - validating required environment variables...')

  const missingVars: string[] = []

  // JWT_SECRET is critical for WebSocket authentication
  if (!process.env['JWT_SECRET']) {
    missingVars.push('JWT_SECRET')
  }

  // MES service account credentials are critical for backend communication
  // Accept either MES_USERNAME/MES_PASSWORD or MES_BACKEND_USER/MES_BACKEND_PASSWORD
  const hasUsername = process.env['MES_USERNAME'] || process.env['MES_BACKEND_USER']
  const hasPassword = process.env['MES_PASSWORD'] || process.env['MES_BACKEND_PASSWORD']

  if (!hasUsername) {
    missingVars.push('MES_USERNAME (or MES_BACKEND_USER)')
  }
  if (!hasPassword) {
    missingVars.push('MES_PASSWORD (or MES_BACKEND_PASSWORD)')
  }

  if (missingVars.length > 0) {
    const errorMessage = [
      '❌ CRITICAL SECURITY ERROR: Missing required environment variables in production',
      '',
      'Missing variables:',
      ...missingVars.map(v => `  - ${v}`),
      '',
      'These environment variables are required to prevent the use of insecure default credentials.',
      'Please configure them in your production environment before deploying.',
      '',
      'For more information, see the security documentation.',
    ].join('\n')

    console.error(errorMessage)

    // Throw an error to prevent the application from starting
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
  }

  console.log('✅ All required environment variables are configured')
}
