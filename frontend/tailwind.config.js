/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          light: '#6366f1',
          DEFAULT: '#4f46e5',
          dark: '#3730a3',
        },
        accent: {
          light: '#f43f5e',
          DEFAULT: '#e11d48',
          dark: '#be123c',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Outfit', 'sans-serif'],
      },
      boxShadow: {
        'premium': '0 10px 30px -10px rgba(0, 0, 0, 0.08)',
        'premium-hover': '0 20px 40px -15px rgba(0, 0, 0, 0.12)',
        'dark-premium': '0 10px 30px -10px rgba(0, 0, 0, 0.4)',
        'dark-premium-hover': '0 20px 40px -15px rgba(0, 0, 0, 0.5)',
      }
    },
  },
  plugins: [],
}
