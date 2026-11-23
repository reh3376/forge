'use client'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Simple 404 page with inline styles to avoid styled-jsx issues during build
export default function NotFound() {
  return (
    <div style={{ margin: 0, fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
      <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxWidth: '400px' }}>
        <h1 style={{ fontSize: '4rem', fontWeight: 'bold', color: '#9ca3af', margin: '0 0 1rem 0' }}>404</h1>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: '0 0 0.5rem 0' }}>Page Not Found</h2>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>The page you're looking for doesn't exist or has been moved.</p>
        <a href="/" style={{ display: 'inline-block', padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: 'white', textDecoration: 'none', borderRadius: '0.375rem', fontWeight: '500' }}>Go to Home</a>
      </div>
    </div>
  )
}
