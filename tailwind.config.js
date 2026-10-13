/** @type {import('tailwindcss').Config} */
// Brohn Smith, House register. Legacy ios-* names are kept so the staff tools pick up the theme.
const ground = '#100e0c'
const ink = '#f2ead9'
const body = '#c6bfaf'
const muted = '#8b8275'
const faint = '#6b6459'
const bronze = '#b08d57'
const signal = '#fe0001'

module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    // Square corners everywhere
    borderRadius: {
      none: '0', sm: '0', DEFAULT: '0', md: '0', lg: '0', xl: '0', '2xl': '0', '3xl': '0', full: '0',
      ios: '0', 'ios-sm': '0', 'ios-xs': '0',
    },
    boxShadow: {
      none: 'none', sm: 'none', DEFAULT: 'none', md: 'none', lg: 'none', xl: 'none',
      'ios-card': 'none', 'ios-sheet': 'none', 'ios-btn': 'none',
    },
    extend: {
      colors: {
        ground, ink, body, muted, faint, hairline: faint, bronze, signal,
        // The staff tools were written light-on-dark inverted: black is ink, white is ground
        black: ink,
        white: ground,
        gold: bronze,
        'ios-bg': ground,
        'ios-card': ground,
        'ios-secondary': muted,
        'ios-separator': faint,
        'ios-blue': ink,
        'ios-red': signal,
        'ios-destructive': signal,
        'ios-green': body,
        'ios-orange': bronze,
        gray: { 50: ground },
        amber: { 50: ground, 400: bronze },
        yellow: { 50: ground },
        blue: { 50: ground },
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
