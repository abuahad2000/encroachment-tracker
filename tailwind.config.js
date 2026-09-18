/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./client/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        apple: {
          light: '#FFFFFF',
          dark: '#1D1D1D',
          gray: '#F5F5F7',
          darkgray: '#424245',
        }
      },
      boxShadow: {
        apple: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        'apple-lg': '0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23)',
      },
      borderRadius: {
        xl: '12px',
      }
    }
  },
  plugins: [],
}
