/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#EA6800',
          dark: '#C45500',
          light: '#FF8C2A',
        },
        dark: {
          bg: '#111111',
          card: '#1C1C1C',
          card2: '#242424',
          border: '#2E2E2E',
        },
        brand: {
          primary: '#F5F5F5',
          secondary: '#A0A0A0',
          muted: '#666666',
        },
        success: '#22C55E',
        danger: '#EF4444',
        warning: '#F59E0B',
        info: '#3B82F6',
      }
    },
  },
  plugins: [],
}
