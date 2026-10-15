import { render, screen } from '@testing-library/react'
import { Logo, LogoAuto } from '../logo'

// Mock Next.js Image component
jest.mock('next/image', () => {
  return function MockImage({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) {
    return <img src={src} alt={alt} {...props} />
  }
})

describe('Logo Component', () => {
  it('renders with default props', () => {
    render(<Logo />)
    const logo = screen.getByAltText('Whiskey House Logo')
    expect(logo).toBeInTheDocument()
    expect(logo).toHaveAttribute('src', '/WHK_Logo_Horizontal_DkGrey.png')
  })

  it('renders symbol variant', () => {
    render(<Logo variant="symbol" />)
    const logo = screen.getByAltText('Whiskey House Logo')
    expect(logo).toHaveAttribute('src', '/WHK_Logo_Symbol_DkGrey.png')
  })

  it('renders logotype variant', () => {
    render(<Logo variant="logotype" />)
    const logo = screen.getByAltText('Whiskey House Logo')
    expect(logo).toHaveAttribute('src', '/WHK_Logo_Logotype_DkGrey.png')
  })

  it('renders with dark theme', () => {
    render(<Logo theme="dark" />)
    const logo = screen.getByAltText('Whiskey House Logo')
    expect(logo).toHaveAttribute('src', '/WHK_Logo_Horizontal_RevWhite.png')
  })

  it('renders with custom className', () => {
    render(<Logo className="custom-class" />)
    const logo = screen.getByAltText('Whiskey House Logo')
    expect(logo).toHaveClass('custom-class')
  })

  it('renders with priority prop', () => {
    render(<Logo priority={true} />)
    const logo = screen.getByAltText('Whiskey House Logo')
    expect(logo).toBeInTheDocument()
  })
})

describe('LogoAuto Component', () => {
  it('renders both light and dark mode logos', () => {
    render(<LogoAuto />)
    const logos = screen.getAllByAltText('Whiskey House Logo')
    expect(logos).toHaveLength(2)
    
    // Check that one has dark:hidden class (light mode logo)
    expect(logos[0]).toHaveClass('dark:hidden')
    // Check that one has hidden dark:block class (dark mode logo)
    expect(logos[1]).toHaveClass('hidden', 'dark:block')
  })

  it('renders symbol variant for both themes', () => {
    render(<LogoAuto variant="symbol" />)
    const logos = screen.getAllByAltText('Whiskey House Logo')
    expect(logos[0]).toHaveAttribute('src', '/WHK_Logo_Symbol_DkGrey.png')
    expect(logos[1]).toHaveAttribute('src', '/WHK_Logo_Symbol_RevWhite.png')
  })
}) 